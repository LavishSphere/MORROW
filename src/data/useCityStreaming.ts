import { useEffect, useRef } from 'react'
import { getCityState, setLoadingMore, subscribeCity, useCitySelector, type CityMap } from '../showcase/cityStore'
import { cameraMotion } from '../showcase/motion'
import { frameStrain } from '../showcase/viewBudget'
import {
  fetchTile,
  mergeAreas,
  TILE_HALF,
  tileKey,
  type LoadedNeighborhood,
  type OsmWay,
} from './overpass'
import {
  BACKGROUND_RADIUS,
  BUILDING_LIMIT,
  IDLE_FILL_MS,
  TILE_LIMIT,
  VIEW_EVERY_MS,
  VIEW_FAR,
  backoffDelay,
  givesUp,
  nextTile,
  ringOrder,
  shouldCommit,
  URGENT_STILL_MS,
  viewTiles,
} from './tileQueue'

/** Start loading when the view is this close to the loaded edge (~300 m). */
const NEAR_EDGE = 42
/** Load the area this far ahead, toward that edge (~500 m). */
const AHEAD = 70
/** At most this many edge-of-view tiles wait their turn; older ones drop. */
const URGENT_LIMIT = 6
/** How often waiting tiles check whether they may join the city. */
const COMMIT_CHECK_MS = 500

/** Run when the browser is idle, with a timeout so it always runs. */
function whenIdle(run: () => void): () => void {
  const idle = globalThis as {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof idle.requestIdleCallback === 'function') {
    const id = idle.requestIdleCallback(run, { timeout: 2000 })
    return () => idle.cancelIdleCallback?.(id)
  }
  const id = setTimeout(run, 50)
  return () => clearTimeout(id)
}

type Pending = { ways: OsmWay[]; keys: string[]; urgent: boolean }

/**
 * True when the map on screen is this place's. Right after a new place is
 * chosen the old city's map is still published for a moment.
 */
function mapIsFor(map: CityMap, place: { lng: number; lat: number }) {
  const g = map.geoBounds
  const margin = 0.02
  return (
    place.lng >= g.west - margin &&
    place.lng <= g.east + margin &&
    place.lat >= g.south - margin &&
    place.lat <= g.north + margin
  )
}

/**
 * Loading the rest of a city. The first download is a quick preview around
 * the place; afterwards everything the camera can see fills in, one tile
 * at a time, nearest to the view's center first, and keeps filling in as
 * you look around. A tile at the edge of the loaded area you are moving
 * toward jumps the queue. While the camera rests, the rings around the
 * place fill in too, the ones in front of the camera first.
 *
 * One Overpass request at a time, a few seconds apart, waiting longer
 * after failures; a tile that keeps failing is given up on. Finished tiles
 * are handed to the city in small batches while the camera is still, so
 * the rebuild never interrupts a move. The procedural stand-in does not
 * stream.
 */
export function useCityStreaming(
  neighborhood: LoadedNeighborhood | null,
  onChange: (next: LoadedNeighborhood) => void,
) {
  // Only the map re-renders the host; the camera pose is read outside React,
  // so moving the camera never re-renders the canvas around it.
  const map = useCitySelector((state) => state.map)
  const failed = useRef(new Set<string>())
  const latest = useRef(neighborhood)
  const change = useRef(onChange)
  const urgent = useRef<string[]>([])
  const fetched = useRef(new Set<string>())
  const attempts = useRef(new Map<string, number>())
  const inflight = useRef<string | null>(null)
  const pending = useRef<Pending>({ ways: [], keys: [], urgent: false })
  const failures = useRef(0)
  const nextAt = useRef(0)
  const lastCommit = useRef(0)
  const lastMove = useRef(0)
  const pumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelIdle = useRef<(() => void) | null>(null)
  const kick = useRef<() => void>(() => {})
  const visible = useRef<string[]>([])

  useEffect(() => {
    latest.current = neighborhood
  }, [neighborhood])
  useEffect(() => {
    change.current = onChange
  }, [onChange])

  const place = neighborhood?.place
  const procedural = Boolean(neighborhood?.procedural)

  // A new place: drop everything queued for the old one and start over.
  useEffect(() => {
    if (!place || procedural) return
    const abort = new AbortController()
    const signal = abort.signal
    urgent.current = []
    fetched.current = new Set()
    attempts.current = new Map()
    failed.current = new Set()
    inflight.current = null
    pending.current = { ways: [], keys: [], urgent: false }
    visible.current = []
    failures.current = 0
    lastCommit.current = Date.now()
    const origin = tileKey(place.lng, place.lat)

    const skip = (key: string) =>
      inflight.current === key ||
      fetched.current.has(key) ||
      failed.current.has(key) ||
      (latest.current?.tiles ?? []).includes(key)

    const buildingCount = () => {
      let count = 0
      for (const way of latest.current?.ways ?? []) if (way.kind === 'building') count += 1
      for (const way of pending.current.ways) if (way.kind === 'building') count += 1
      return count
    }

    /** Enough of this city: only tiles at the edge you walk toward load now. */
    const full = () =>
      new Set([...fetched.current, ...(latest.current?.tiles ?? [])]).size >= TILE_LIMIT ||
      buildingCount() > BUILDING_LIMIT

    /** Every tile on screen, worked out again every second or two. */
    const lookAround = () => {
      const { map: cityMap, pose: view } = getCityState()
      if (!cityMap || !mapIsFor(cityMap, place)) return
      if (view.eyeX === undefined || view.eyeY === undefined || view.eyeZ === undefined) return
      visible.current = viewTiles({
        camera: {
          eye: [view.eyeX, view.eyeY, view.eyeZ],
          target: [view.x, 0, view.z],
          fov: view.fov ?? 34,
          aspect: view.aspect ?? 1.6,
        },
        far: VIEW_FAR,
        tileDeg: TILE_HALF * 2,
        unproject: cityMap.unproject,
        project: cityMap.project,
        maxTiles: TILE_LIMIT,
      })
    }

    /**
     * How long the camera has been still: no pose change, and no scroll,
     * drag, or key, which can come before the camera reacts.
     */
    const stillFor = () => {
      const now = Date.now()
      return Math.min(now - lastMove.current, cameraMotion.idleFor(now))
    }

    /** Rings around the place, only while the camera rests. */
    const background = () => {
      if (stillFor() < IDLE_FILL_MS) return []
      const { map: cityMap, pose: view } = getCityState()
      if (!cityMap || !mapIsFor(cityMap, place)) return ringOrder(origin, BACKGROUND_RADIUS)
      const tile = TILE_HALF * 2
      const [lng, lat] = cityMap.unproject(view.x, view.z)
      const [aheadLng, aheadLat] = cityMap.unproject(view.x + view.dirX, view.z + view.dirZ)
      return ringOrder(origin, BACKGROUND_RADIUS, {
        x: lng / tile,
        y: lat / tile,
        dirX: (aheadLng - lng) / tile,
        dirY: (aheadLat - lat) / tile,
      })
    }

    const commit = () => {
      cancelIdle.current = null
      const base = latest.current
      const batch = pending.current
      if (signal.aborted || !base || base.place !== place || batch.keys.length === 0) return
      // The camera moved while this waited for an idle moment: wait again.
      if (stillFor() < URGENT_STILL_MS) {
        if (!commitTimer.current) commitTimer.current = setTimeout(checkCommit, COMMIT_CHECK_MS)
        return
      }
      pending.current = { ways: [], keys: [], urgent: false }
      lastCommit.current = Date.now()
      const next = mergeAreas(base, batch.ways, batch.keys)
      // Later batches build on this one even before React re-renders.
      latest.current = next
      change.current(next)
    }

    const checkCommit = () => {
      commitTimer.current = null
      if (signal.aborted || pending.current.keys.length === 0 || cancelIdle.current) return
      const now = Date.now()
      const ready = shouldCommit({
        pending: pending.current.keys.length,
        urgent: pending.current.urgent,
        sinceCommitMs: now - lastCommit.current,
        stillMs: stillFor(),
      })
      if (ready) cancelIdle.current = whenIdle(commit)
      else commitTimer.current = setTimeout(checkCommit, COMMIT_CHECK_MS)
    }

    const schedule = () => {
      if (signal.aborted || pumpTimer.current || inflight.current) return
      pumpTimer.current = setTimeout(pump, Math.max(0, nextAt.current - Date.now()))
    }

    const pump = () => {
      pumpTimer.current = null
      if (signal.aborted || inflight.current) return
      // While frames are slow, only the edge you move toward loads.
      const roomy = !full() && !frameStrain.strained
      const pick = nextTile({
        urgent: urgent.current,
        view: roomy ? visible.current : [],
        background: roomy ? background() : [],
        skip,
      })
      if (!pick) return
      const { key } = pick
      urgent.current = urgent.current.filter((item) => item !== key)
      inflight.current = key
      if (pick.urgent) setLoadingMore(true)
      fetchTile(key, signal)
        .then((ways) => {
          if (signal.aborted) return
          fetched.current.add(key)
          failures.current = 0
          const batch = pending.current
          pending.current = {
            ways: [...batch.ways, ...ways],
            keys: [...batch.keys, key],
            urgent: batch.urgent || pick.urgent,
          }
        })
        .catch(() => {
          if (signal.aborted) return
          failures.current += 1
          const tries = (attempts.current.get(key) ?? 0) + 1
          attempts.current.set(key, tries)
          if (givesUp(tries)) failed.current.add(key)
        })
        .finally(() => {
          if (signal.aborted) return
          inflight.current = null
          if (pick.urgent) setLoadingMore(false)
          nextAt.current = Date.now() + backoffDelay(failures.current)
          if (!commitTimer.current) checkCommit()
          schedule()
        })
    }

    kick.current = () => {
      if (!commitTimer.current && pending.current.keys.length > 0) checkCommit()
      schedule()
    }
    // The preview is on screen; the rest follows after the usual pause.
    nextAt.current = Date.now() + backoffDelay(0)
    lookAround()
    schedule()
    // Looking around reveals new ground: queue it, and wake an idle queue.
    const watch = setInterval(() => {
      lookAround()
      schedule()
    }, VIEW_EVERY_MS)

    return () => {
      abort.abort()
      clearInterval(watch)
      if (pumpTimer.current) clearTimeout(pumpTimer.current)
      if (commitTimer.current) clearTimeout(commitTimer.current)
      cancelIdle.current?.()
      pumpTimer.current = null
      commitTimer.current = null
      cancelIdle.current = null
      inflight.current = null
      kick.current = () => {}
      setLoadingMore(false)
    }
  }, [place, procedural])

  // Near the loaded edge: the area just beyond it goes to the front of the queue.
  useEffect(() => {
    const checkEdge = () => {
      const { pose } = getCityState()
      if (!neighborhood || neighborhood.procedural || !map || !mapIsFor(map, neighborhood.place)) return
      const b = map.bounds
      const gaps = [
        { d: pose.x - b.minX, dx: -1, dz: 0 },
        { d: b.maxX - pose.x, dx: 1, dz: 0 },
        { d: pose.z - b.minZ, dx: 0, dz: -1 },
        { d: b.maxZ - pose.z, dx: 0, dz: 1 },
      ].sort((a, c) => a.d - c.d)
      const nearest = gaps[0]
      if (!nearest || nearest.d > NEAR_EDGE) return

      const [lng, lat] = map.unproject(pose.x + nearest.dx * AHEAD, pose.z + nearest.dz * AHEAD)
      const key = tileKey(lng, lat)
      if ((neighborhood.tiles ?? []).includes(key) || failed.current.has(key)) return
      if (pending.current.keys.includes(key)) {
        // Already downloaded in the background: show it now.
        pending.current.urgent = true
      } else if (inflight.current !== key && !fetched.current.has(key) && urgent.current[0] !== key) {
        urgent.current = [key, ...urgent.current.filter((item) => item !== key)].slice(0, URGENT_LIMIT)
      }
      kick.current()
    }
    checkEdge()
    let last = getCityState().pose
    return subscribeCity(() => {
      const { pose } = getCityState()
      if (pose === last) return
      last = pose
      lastMove.current = Date.now()
      checkEdge()
    })
  }, [map, neighborhood])
}
