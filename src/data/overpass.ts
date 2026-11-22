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

const OVERPASS = 'https://overpass.openstreetmap.fr/api/interpreter'
/** Half-size of the loaded box in degrees: about 1.8 km across, a whole town center. */
const HALF = 0.008

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

function neighborhoodQuery(place: UsPlace): string {
  const south = place.lat - HALF
  const north = place.lat + HALF
  const west = place.lng - HALF
  const east = place.lng + HALF
  const box = `${south},${west},${north},${east}`
  // Streets and buildings get separate quotas, so a dense downtown's
  // buildings cannot crowd out its streets.
  return `[out:json][timeout:60];way["highway"](${box});out tags geom 2500;way["building"](${box});out tags geom 3000;`
}

async function fetchWays(place: UsPlace): Promise<OsmWay[]> {
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ data: neighborhoodQuery(place) }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  return waysFromOverpass(await res.json())
}

/**
 * Geocode a US place and pull the surrounding streets and buildings
 * from OpenStreetMap. This is a basemap, not a barrier list.
 */
export async function loadUsNeighborhood(
  query: string,
  magicKey?: string,
): Promise<LoadedNeighborhood> {
  const place = await geocodeUsPlace(query, magicKey)
  if (!place) {
    throw new Error('No US place matched that name.')
  }
  try {
    const ways = await fetchWays(place)
    const roads = ways.filter((way) => way.kind === 'road').length
    const buildings = ways.length - roads
    return {
      place,
      ways,
      note: `${place.label}. OpenStreetMap returned ${roads} roads and ${buildings} buildings for this neighborhood. Not a barrier inventory.`,
    }
  } catch {
    return {
      place,
      ways: [],
      note: `${place.label}. Imagery is showing, but the OpenStreetMap street query failed. Not a barrier inventory.`,
    }
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
