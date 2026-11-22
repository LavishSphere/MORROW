import { nearestOnPolyline, polylineLength, type Pt } from './rail.ts'
import { CAR_GAP, CAR_LENGTH, consistSize, type TrackLine } from './trains.ts'

/**
 * Simulated trains, so every city with mapped track has moving trains.
 * Track ways are stitched into routes per line colour (or ref), trains run
 * back and forth on a seeded, repeatable timetable with headways from a
 * small table, and they pause at the stations along the way. Positions are
 * a pure function of time.
 */

/** One original track way inside a stitched route. */
export type RouteSegment = { start: number; end: number; line: number }

export type RailRoute = {
  key: string
  colour: string
  railway: string
  points: Pt[]
  length: number
  segments: RouteSegment[]
  /** Distances along the route where trains stop, ascending. */
  stops: number[]
  bbox: { minX: number; maxX: number; minZ: number; maxZ: number }
}

/** Minutes between trains in real service, by railway type. */
export const HEADWAY_MINUTES: Record<string, number> = {
  subway: 8,
  light_rail: 8,
  monorail: 8,
  tram: 10,
  funicular: 10,
  narrow_gauge: 30,
  rail: 30,
}

/** Scene units per second: brisk, so trains read as moving at city scale. */
const SPEED: Record<string, number> = { subway: 3, light_rail: 2.2, monorail: 3, tram: 1.6, funicular: 1, rail: 4 }
/**
 * Simulated time runs this much faster than a real timetable, so an
 * 8-minute headway is a train about every 48 s on screen.
 */
export const TIME_COMPRESSION = 10
/** Seconds a train waits at a station. */
export const DWELL_S = 4
export const MAX_SIM_TRAINS = 40
export const MAX_SIM_CARS = 240
/** Routes shorter than this are stubs, not worth a train. */
const MIN_ROUTE = 8
/** A station this close to a route is a stop on it (≈40 m). */
const STOP_REACH = 6

/** Cars on neutral (uncoloured) track: brushed steel. */
export const NEUTRAL_TRAIN = '#c9ced3'

function same(a: Pt, b: Pt, tolerance: number) {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance
}

function heading(a: Pt, b: Pt) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len] as const
}

type Piece = { line: number; points: Pt[] }

/**
 * Join track ways of one line into continuous routes. At a junction the
 * straightest continuation wins. Ways of different colours never join.
 */
export function stitchRoutes(lines: readonly (TrackLine & { ref?: string })[], tolerance = 0.05): RailRoute[] {
  const groups = new Map<string, Piece[]>()
  lines.forEach((line, index) => {
    if (line.points.length < 2) return
    const key = line.colour ?? `${line.railway}:${line.ref ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), { line: index, points: [...line.points] }])
  })
  const routes: RailRoute[] = []
  for (const [key, pool] of groups) {
    pool.sort((a, b) => polylineLength(b.points) - polylineLength(a.points))
    let chainIndex = 0
    while (pool.length > 0) {
      const seed = pool.shift()!
      let chain = seed.points
      // Pieces in order, each with its own direction along the chain.
      let pieces: { line: number; length: number }[] = [{ line: seed.line, length: polylineLength(seed.points) }]
      for (const atEnd of [true, false]) {
        for (;;) {
          const end = atEnd ? chain[chain.length - 1]! : chain[0]!
          const inner = atEnd ? chain[chain.length - 2]! : chain[1]!
          const out = heading(inner, end)
          let best = -1
          let bestPoints: Pt[] = []
          let bestTurn = -Infinity
          pool.forEach((piece, i) => {
            const first = piece.points[0]!
            const last = piece.points[piece.points.length - 1]!
            const oriented = same(first, end, tolerance)
              ? piece.points
              : same(last, end, tolerance)
                ? [...piece.points].reverse()
                : null
            if (!oriented || oriented.length < 2) return
            const next = heading(oriented[0]!, oriented[1]!)
            const turn = out[0] * next[0] + out[1] * next[1]
            if (turn > bestTurn) {
              bestTurn = turn
              best = i
              bestPoints = oriented
            }
          })
          // Stop at a reversal: that is another branch, not a continuation.
          if (best < 0 || bestTurn < -0.2) break
          const [piece] = pool.splice(best, 1)
          const entry = { line: piece!.line, length: polylineLength(bestPoints) }
          if (atEnd) {
            chain = [...chain, ...bestPoints.slice(1)]
            pieces = [...pieces, entry]
          } else {
            chain = [...[...bestPoints].reverse(), ...chain.slice(1)]
            pieces = [entry, ...pieces]
          }
        }
      }
      const length = polylineLength(chain)
      if (length < MIN_ROUTE) continue
      const segments: RouteSegment[] = []
      let at = 0
      for (const piece of pieces) {
        segments.push({ start: at, end: at + piece.length, line: piece.line })
        at += piece.length
      }
      const bbox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
      for (const [x, z] of chain) {
        bbox.minX = Math.min(bbox.minX, x)
        bbox.maxX = Math.max(bbox.maxX, x)
        bbox.minZ = Math.min(bbox.minZ, z)
        bbox.maxZ = Math.max(bbox.maxZ, z)
      }
      const railway = lines[seed.line]?.railway ?? 'rail'
      routes.push({
        key: `${key}#${chainIndex}`,
        colour: lines[seed.line]?.colour ?? NEUTRAL_TRAIN,
        railway,
        points: chain,
        length,
        segments,
        stops: [],
        bbox,
      })
      chainIndex += 1
    }
  }
  return routes
}

/** Stations within reach of a route become its stops (entrances do not count). */
export function withStops(
  routes: readonly RailRoute[],
  stations: readonly { x: number; z: number; entrance?: boolean }[],
): RailRoute[] {
  return routes.map((route) => {
    const stops: number[] = []
    for (const station of stations) {
      if (station.entrance) continue
      const snap = nearestOnPolyline(station.x, station.z, route.points)
      if (snap.distance > STOP_REACH) continue
      if (stops.some((a) => Math.abs(a - snap.along) < 3)) continue
      stops.push(snap.along)
    }
    return { ...route, stops: stops.sort((a, b) => a - b) }
  })
}

/** Which original track way covers a distance along the route. */
export function segmentAt(route: RailRoute, along: number): RouteSegment | null {
  for (const segment of route.segments) if (along <= segment.end) return segment
  return route.segments[route.segments.length - 1] ?? null
}

/** A small repeatable hash in [0, 1). */
export function seeded(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100_000) / 100_000
}

export function speedOf(railway: string) {
  return SPEED[railway] ?? 2.5
}

/** Seconds for one trip end to end, with a pause at every stop and half a pause at each end. */
export function tripSeconds(route: RailRoute): number {
  return route.length / speedOf(route.railway) + DWELL_S * (route.stops.length + 1)
}

/** Distance covered `t` seconds into a one-way trip that stops at `stops`. */
function travelled(t: number, length: number, stops: readonly number[], speed: number): number {
  let time = DWELL_S / 2
  if (t <= time) return 0
  let at = 0
  for (const stop of [...stops, length]) {
    const run = (stop - at) / speed
    if (t <= time + run) return at + (t - time) * speed
    time += run
    at = stop
    if (stop === length) return length
    time += DWELL_S
    if (t <= time) return stop
  }
  return length
}

/** One simulated train: which route, and where in the cycle it starts (0–1). */
export type SimTrain = { route: number; offset: number; cars: number }

/**
 * Trains per route from its headway, then capped: longest routes first,
 * at most MAX_SIM_TRAINS trains and MAX_SIM_CARS cars in all.
 */
export function planSimulation(
  routes: readonly RailRoute[],
  limits = { trains: MAX_SIM_TRAINS, cars: MAX_SIM_CARS },
): SimTrain[] {
  const order = routes.map((route, index) => ({ route, index })).sort((a, b) => b.route.length - a.route.length)
  const trains: SimTrain[] = []
  let cars = 0
  for (const { route, index } of order) {
    const headway = ((HEADWAY_MINUTES[route.railway] ?? 15) * 60) / TIME_COMPRESSION
    const cycle = 2 * tripSeconds(route)
    const want = Math.max(1, Math.round(cycle / headway))
    const size = consistSize(route.railway)
    const seed = seeded(route.key)
    for (let k = 0; k < want; k += 1) {
      if (trains.length >= limits.trains || cars + size > limits.cars) return trains
      trains.push({ route: index, offset: (seed + k / want) % 1, cars: size })
      cars += size
    }
  }
  return trains
}

/**
 * Where a simulated train is at time `t` (seconds): out along the route,
 * then back, pausing at each stop. Repeats exactly for the same t.
 */
export function simPosition(route: RailRoute, train: SimTrain, t: number): { along: number; dir: 1 | -1 } {
  const speed = speedOf(route.railway)
  const trip = tripSeconds(route)
  const phase = (((t / (2 * trip) + train.offset) % 1) + 1) % 1 * 2 * trip
  if (phase < trip) return { along: travelled(phase, route.length, route.stops, speed), dir: 1 }
  const back = route.stops.map((a) => route.length - a).reverse()
  return { along: route.length - travelled(phase - trip, route.length, back, speed), dir: -1 }
}

/**
 * Where the front of a simulated train is drawn, squeezed so its whole
 * consist stays on the route at both ends instead of piling up.
 */
export function consistFront(along: number, dir: 1 | -1, length: number, cars: number): number {
  const train = Math.min(length, cars * (CAR_LENGTH + CAR_GAP))
  const scaled = (along / Math.max(1e-6, length)) * (length - train)
  return dir === 1 ? train + scaled : scaled
}
