import { generateCity } from './proceduralCity.ts'
import { geocodeUsPlace, type UsPlace } from './places.ts'
import { resolveRoadWidth, type WidthKind } from './roadWidth.ts'

export type OsmWay = {
  id: number
  name: string | null
  /** 'part' is an OSM building:part: one 3D piece of a detailed building. */
  kind: 'road' | 'building' | 'part' | 'water' | 'waterway'
  /** OSM highway tag (footway, residential, …) when the way is a street. */
  highway?: string | null
  /** OSM building tag (house, college, …) when the way is a building. */
  building?: string | null
  /** OSM water tag (lake, pond, …) when the way is a shoreline. */
  water?: string | null
  /** OSM waterway tag (river, stream, canal) when the way is a centerline. */
  waterway?: string | null
  /** Accessibility tags the issue detector reads (crossing, sidewalk, surface…). */
  tags?: Record<string, string>
  /** [longitude, latitude] */
  points: [number, number][]
  /** Lane count when the way has one. Kept even when a tagged width wins. */
  lanes?: number | null
  /** Tagged carriageway width in meters, when the tag is a real number. */
  taggedWidthMeters?: number | null
  /** Resolved ribbon width in meters. */
  widthMeters?: number | null
  /** tagged, lanes, or prior. A class fallback is prior. */
  widthKind?: WidthKind | null
  /** Meters-per-lane assumption. Set only when widthKind is lanes. */
  metersPerLane?: number | null
}

export type LoadedNeighborhood = {
  place: UsPlace
  ways: OsmWay[]
  /** Honest status. Never claims a barrier inventory. */
  note: string
  /** True when OpenStreetMap was unreachable and a seeded stand-in was built. */
  procedural?: boolean
  /** Areas already downloaded, so walking on does not fetch them twice. */
  tiles?: string[]
}

const OVERPASS = 'https://overpass.openstreetmap.fr/api/interpreter'
/** Half-size of one downloaded area in degrees: about 1.4 km across. */
const HALF = 0.0065
/** Accessibility tags kept from OpenStreetMap for issue detection. */
const KEEP_TAGS = [
  'footway',
  'crossing',
  'surface',
  'sidewalk',
  'sidewalk:both',
  'sidewalk:left',
  'sidewalk:right',
  'lanes',
  'lanes:forward',
  'lanes:backward',
  'width',
  // Real 3D shape, where mappers recorded it (Simple 3D Buildings).
  'height',
  'min_height',
  'building:levels',
  'building:min_level',
  'roof:shape',
  'roof:height',
  'building:colour',
  'building:material',
  'roof:colour',
]

/** Areas snap to a grid, so nearby requests share one download. */
export function tileKey(lng: number, lat: number) {
  return `${Math.round(lng / (HALF * 2))}:${Math.round(lat / (HALF * 2))}`
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
      tags?: Record<string, unknown>
      geometry?: { lat?: unknown; lon?: unknown }[]
    }
    if (typeof row.id !== 'number' || !Array.isArray(row.geometry)) continue
    const points: [number, number][] = []
    for (const point of row.geometry) {
      if (typeof point?.lon !== 'number' || typeof point?.lat !== 'number') continue
      points.push([point.lon, point.lat])
    }
    if (points.length < 2) continue
    const part = typeof row.tags?.['building:part'] === 'string'
    const building = !part && typeof row.tags?.building === 'string'
    const highway = typeof row.tags?.highway === 'string'
    const natural = row.tags?.natural === 'water'
    const water = typeof row.tags?.water === 'string' ? row.tags.water : null
    const waterway = typeof row.tags?.waterway === 'string' ? row.tags.waterway : null
    const name = typeof row.tags?.name === 'string' ? row.tags.name : null
    const kind = part
      ? 'part'
      : building
        ? 'building'
        : highway
          ? 'road'
          : natural || water
            ? 'water'
            : waterway === 'river' || waterway === 'stream' || waterway === 'canal'
              ? 'waterway'
              : null
    if (!kind) continue
    const tags: Record<string, string> = {}
    for (const key of KEEP_TAGS) {
      const value = row.tags?.[key]
      if (typeof value === 'string') tags[key] = value
    }
    const width = kind === 'road' ? resolveRoadWidth(row.tags ?? {}) : null
    ways.push({
      id: row.id,
      name,
      kind,
      highway: highway ? String(row.tags?.highway) : null,
      building: building ? String(row.tags?.building) : null,
      water,
      waterway,
      ...(Object.keys(tags).length > 0 ? { tags } : {}),
      points,
      lanes: width?.lanes ?? null,
      taggedWidthMeters: width?.taggedWidthMeters ?? null,
      widthMeters: width?.widthMeters ?? null,
      widthKind: width?.widthKind ?? null,
      metersPerLane: width?.metersPerLane ?? null,
    })
  }
  return ways
}

/** Real streets and buildings in one area around a point, from OpenStreetMap. */
export async function fetchArea(lng: number, lat: number): Promise<OsmWay[]> {
  const box = `${lat - HALF},${lng - HALF},${lat + HALF},${lng + HALF}`
  // Streets, buildings, landmark pieces, and water get separate quotas.
  const query = `[out:json][timeout:60];way["highway"](${box});out tags geom 2500;way["building"](${box});out tags geom 4000;way["building:part"](${box});out tags geom 5000;way["natural"="water"](${box});out tags geom 400;way["waterway"~"^(river|stream|canal)$"](${box});out tags geom 800;`
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  return waysFromOverpass(await res.json())
}

function describe(place: UsPlace, ways: OsmWay[]) {
  const roads = ways.filter((way) => way.kind === 'road').length
  const buildings = ways.filter((way) => way.kind === 'building').length
  const water = ways.filter((way) => way.kind === 'water' || way.kind === 'waterway').length
  return `${place.label}. OpenStreetMap: ${roads} streets, ${buildings} buildings, and ${water} water shapes so far; more load as you explore. Water is the mapped shoreline. Not a barrier inventory.`
}

/**
 * Geocode a US place and load its real streets and buildings from
 * OpenStreetMap. Only if OpenStreetMap cannot be reached is a seeded
 * procedural stand-in built, and the note says so. Wellesley itself stays
 * the bundled map.
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
    const ways = await fetchArea(place.lng, place.lat)
    if (ways.length > 0) {
      return { place, ways, note: describe(place, ways), tiles: [tileKey(place.lng, place.lat)] }
    }
  } catch {
    // Fall through to the labeled stand-in below.
  }
  const ways = generateCity(place)
  return {
    place,
    ways,
    procedural: true,
    note: `${place.label}. OpenStreetMap could not be reached, so this is a procedural stand-in, not its real streets. Not a barrier inventory.`,
  }
}

/**
 * Walked near the edge: download the real area around (lng, lat) and add
 * it to the neighborhood. Ways already loaded are kept once.
 */
export async function extendNeighborhood(
  neighborhood: LoadedNeighborhood,
  lng: number,
  lat: number,
): Promise<LoadedNeighborhood> {
  const key = tileKey(lng, lat)
  const tiles = neighborhood.tiles ?? []
  if (neighborhood.procedural || tiles.includes(key)) return neighborhood
  const fresh = await fetchArea(lng, lat)
  const seen = new Set(neighborhood.ways.map((way) => way.id))
  const ways = [...neighborhood.ways, ...fresh.filter((way) => !seen.has(way.id))]
  return { ...neighborhood, ways, tiles: [...tiles, key], note: describe(neighborhood.place, ways) }
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
    if (way.kind === 'water') {
      if (way.points.length < 3) continue
      const ring = [...way.points]
      const [first] = ring
      const last = ring[ring.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first)
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { osmId: way.id, layer: 'water', name: way.name, water: way.water ?? 'water' },
      })
      continue
    }
    if (way.kind === 'waterway') {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: way.points },
        properties: { osmId: way.id, layer: 'waterway', name: way.name, waterway: way.waterway },
      })
      continue
    }
    if (way.kind === 'building' || way.kind === 'part') {
      if (way.points.length < 3) continue
      const ring = [...way.points]
      const [first] = ring
      const last = ring[ring.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first)
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          osmId: way.id,
          layer: way.kind === 'part' ? 'building_part' : 'building',
          name: way.name,
          building: way.building ?? 'yes',
          ...way.tags,
        },
      })
      continue
    }
    const highway = way.highway ?? ''
    const layer = FOOT.has(highway) ? 'footway' : PATH.has(highway) ? 'path' : 'road'
    const width = way.widthKind
      ? way
      : resolveRoadWidth({ highway, lanes: way.lanes, width: way.taggedWidthMeters, ...way.tags })
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: way.points },
      properties: {
        ...way.tags,
        osmId: way.id,
        layer,
        name: way.name,
        highway,
        lanes: width.lanes,
        width: width.taggedWidthMeters ?? way.tags?.width,
        widthMeters: width.widthMeters,
        widthKind: width.widthKind,
        metersPerLane: width.metersPerLane,
      },
    })
  }
  // The center keeps scene coordinates stable as more areas load in.
  return { type: 'FeatureCollection', features, center: [neighborhood.place.lng, neighborhood.place.lat] }
}
