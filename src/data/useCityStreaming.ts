import { useEffect, useRef } from 'react'
import { setLoadingMore, useCityState } from '../showcase/cityStore'
import { extendNeighborhood, tileKey, type LoadedNeighborhood } from './overpass'

/** Start loading when the view is this close to the loaded edge (~300 m). */
const NEAR_EDGE = 42
/** Load the area this far ahead, toward that edge (~500 m). */
const AHEAD = 70

/**
 * Walking through a loaded city: as the view nears the edge of what is
 * loaded, download the real streets and buildings just beyond it and add
 * them to the city. One area at a time; an area that fails is not retried.
 * The procedural stand-in does not stream.
 */
export function useCityStreaming(
  neighborhood: LoadedNeighborhood | null,
  onChange: (next: LoadedNeighborhood) => void,
) {
  const { map, pose } = useCityState()
  const busy = useRef(false)
  const failed = useRef(new Set<string>())
  const latest = useRef(neighborhood)

  useEffect(() => {
    latest.current = neighborhood
  }, [neighborhood])

  useEffect(() => {
    if (!neighborhood || neighborhood.procedural || !map || busy.current) return
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

    busy.current = true
    setLoadingMore(true)
    extendNeighborhood(neighborhood, lng, lat)
      .then((next) => {
        // Only if the same city is still on screen.
        if (next !== neighborhood && latest.current?.place.label === neighborhood.place.label) {
          onChange(next)
        }
      })
      .catch(() => {
        failed.current.add(key)
      })
      .finally(() => {
        busy.current = false
        setLoadingMore(false)
      })
  }, [map, pose, neighborhood, onChange])
}
