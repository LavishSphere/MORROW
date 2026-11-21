import { geocodeUsPlace, type UsPlace } from './places.ts'

export type OsmWay = {
  id: number
  name: string | null
  kind: 'road' | 'building'
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
const HALF = 0.006

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
  return `[out:json][timeout:20];(way["highway"](${south},${west},${north},${east});way["building"](${south},${west},${north},${east}););out tags geom 250;`
}

async function fetchWays(place: UsPlace): Promise<OsmWay[]> {
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ data: neighborhoodQuery(place) }),
    signal: AbortSignal.timeout(25000),
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
