import { generateCity } from './proceduralCity.ts'
import { geocodeUsPlace, type UsPlace } from './places.ts'

export type OsmWay = {
  id: number
  name: string | null
  kind: 'road' | 'building'
  /** OSM highway tag (footway, residential, …) when the way is a street. */
  highway?: string | null
  /** OSM building tag (house, college, …) when the way is a building. */
  building?: string | null
  /** [longitude, latitude] */
  points: [number, number][]
}

export type LoadedNeighborhood = {
  place: UsPlace
  ways: OsmWay[]
  /** Honest status. Never claims a barrier inventory. */
  note: string
}

/** Read way geometries from an Overpass JSON body. */
export function waysFromOverpass(body: unknown): OsmWay[] {
  if (!body || typeof body !== 'object') return []
  const elements = (body as { elements?: unknown }).elements
  if (!Array.isArray(elements)) return []
  const ways: OsmWay[] = []
  for (const element of elements) {
    if (!element || typeof element !== 'object') continue
    const row = element as {
      id?: unknown
      tags?: { name?: unknown; highway?: unknown; building?: unknown }
      geometry?: { lat?: unknown; lon?: unknown }[]
    }
    if (typeof row.id !== 'number' || !Array.isArray(row.geometry)) continue
    const points: [number, number][] = []
    for (const point of row.geometry) {
      if (typeof point?.lon !== 'number' || typeof point?.lat !== 'number') continue
      points.push([point.lon, point.lat])
    }
    if (points.length < 2) continue
    const building = typeof row.tags?.building === 'string'
    const name = typeof row.tags?.name === 'string' ? row.tags.name : null
    ways.push({
      id: row.id,
      name,
      kind: building ? 'building' : 'road',
      highway: typeof row.tags?.highway === 'string' ? row.tags.highway : null,
      building: building ? String(row.tags?.building) : null,
      points,
    })
  }
  return ways
}

/**
 * Geocode a US place and build a whole procedural city around it.
 * Wellesley itself stays the bundled map. This is not a survey of the
 * named city's streets.
 */
export async function loadUsNeighborhood(
  query: string,
  magicKey?: string,
): Promise<LoadedNeighborhood> {
  const place = await geocodeUsPlace(query, magicKey)
  if (!place) {
    throw new Error('No US place matched that name.')
  }
  const ways = generateCity(place)
  const roads = ways.filter((way) => way.kind === 'road').length
  const buildings = ways.length - roads
  return {
    place,
    ways,
    note: `${place.label}. Procedural city, ${roads} streets and ${buildings} buildings, centered on that place. Not a survey of its real streets. Not a barrier inventory.`,
  }
}

const FOOT = new Set(['footway', 'pedestrian', 'steps', 'corridor', 'living_street'])
const PATH = new Set(['path', 'track', 'cycleway', 'bridleway'])

/**
 * Turn a loaded neighborhood into the same FeatureCollection shape as
 * data/wellesley/basemap.geojson, so the 3D city can rebuild from it.
 */
export function neighborhoodGeoJson(neighborhood: LoadedNeighborhood) {
  const features = []
  for (const way of neighborhood.ways) {
    if (way.kind === 'building') {
      if (way.points.length < 3) continue
      const ring = [...way.points]
      const [first] = ring
      const last = ring[ring.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first)
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { osmId: way.id, layer: 'building', name: way.name, building: way.building ?? 'yes' },
      })
      continue
    }
    const highway = way.highway ?? ''
    const layer = FOOT.has(highway) ? 'footway' : PATH.has(highway) ? 'path' : 'road'
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: way.points },
      properties: { osmId: way.id, layer, name: way.name, highway },
    })
  }
  return { type: 'FeatureCollection', features }
}
