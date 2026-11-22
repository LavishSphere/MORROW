import { generateCity } from './proceduralCity.ts'
import { geocodeUsPlace, type UsPlace } from './places.ts'
import { resolveRoadWidth, type WidthKind } from './roadWidth.ts'
import { lineColour, railRefsFrom, railTags, railWayKind, STATION_NODE_TYPES, type RailRef } from './rail.ts'
import { coastQuery, landmarkQuery, tileCenter, tileKey, tileQuery, TILE_HALF } from '../../shared/osmQueries.ts'

export { tileCenter, tileKey, TILE_HALF }

export type OsmWay = {
  id: number
  /** Set when the shape came from a multipolygon relation, whose ids can repeat way ids. */
  osmType?: 'relation'
  name: string | null
  /**
   * 'part' is an OSM building:part: one 3D piece of a detailed building.
   * 'bridge' is a man_made=bridge outline: the structure under its roads.
   */
  kind: 'road' | 'building' | 'part' | 'water' | 'waterway' | 'coastline' | 'bridge' | 'rail' | 'platform' | 'station' | 'sand' | 'tree'
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
  /** Rail line colour from the way or its route relations; null is neutral track. */
  lineColour?: string | null
  /** Route refs the way carries (Red, Green-B, CR-Worcester…), joined with ';'. */
  lineRef?: string | null
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

/**
 * Public Overpass servers, tried in order when the MORROW API cannot answer.
 * One may refuse some clients (403) or be busy (429, 5xx); the next one is
 * tried instead. (The French server now answers only white-listed clients.)
 */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const
/**
 * The MORROW API keeps every map answer on disk and pre-loads major cities,
 * so most places load from there in a second. Unset in tests and local
 * builds without an API.
 */
const OSM_API = (() => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  const base = env?.VITE_API_BASE?.trim().replace(/\/$/, '')
  return base ? `${base}/api/osm` : null
})()
/** After the API fails, browsers go straight to Overpass for a while. */
let apiDownUntil = 0
/** A server that has not even started answering by now is skipped. */
const FIRST_BYTE_MS = 20000
/** Wait before asking every server a second time for a new place. */
const RETRY_AFTER_MS = 4000
/** Only a first try that failed this fast is worth a second. */
const RETRY_WITHIN_MS = 20000
/** The server that last answered, so later tiles go straight to it. */
let workingEndpoint: string | null = null

/** Servers to try, the one that last worked first. */
export function endpointOrder(preferred: string | null): string[] {
  const rest = OVERPASS_ENDPOINTS.filter((url) => url !== preferred)
  return preferred && OVERPASS_ENDPOINTS.some((url) => url === preferred) ? [preferred, ...rest] : rest
}

/** Refused, rate limited, or failing: worth asking the next server. */
export function tryNextEndpoint(status: number): boolean {
  return status === 403 || status === 429 || status >= 500
}

/** Forget the remembered server (a new session, or a test). */
export function resetOverpassEndpoint() {
  workingEndpoint = null
}

export function currentOverpassEndpoint() {
  return workingEndpoint
}
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
  // Traffic direction, and the places nobody is drawn walking (indoors, under cover, underground).
  'oneway',
  'junction',
  'indoor',
  'tunnel',
  'covered',
  'level',
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
  // Bridges and tunnels: which ways leave the ground, and how.
  'bridge',
  'bridge:structure',
  'colour',
  'ref',
]

/** OSM reference for a loaded shape: the way id, or `r<id>` for a relation. */
export function osmRef(way: Pick<OsmWay, 'id' | 'osmType'>): number | string {
  return way.osmType === 'relation' ? `r${way.id}` : way.id
}

function wayKey(way: OsmWay) {
  return `${way.kind}:${osmRef(way)}`
}

/** Never drawn on the ground: indoor, unbuilt, or not a street at all. */
const OFF_STREET = new Set(['corridor', 'proposed', 'construction', 'platform', 'elevator'])

/**
 * Highways that run underground or indoors (tunnels, covered ways, layer
 * below zero) would be drawn through the buildings above them.
 */
function underground(tags: Record<string, unknown> | undefined) {
  if (!tags) return false
  const tunnel = tags.tunnel
  if (typeof tunnel === 'string' && tunnel !== 'no') return true
  if (tags.covered === 'yes' || tags.indoor === 'yes') return true
  const layer = Number(tags.layer)
  return Number.isFinite(layer) && layer < 0
}


function closeEnough(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
}

function isClosedRing(points: [number, number][]) {
  const first = points[0]
  const last = points[points.length - 1]
  return Boolean(first && last && points.length >= 4 && closeEnough(first, last))
}

function asLonLatLine(geometry: unknown): [number, number][] {
  if (!Array.isArray(geometry)) return []
  const points: [number, number][] = []
  for (const point of geometry) {
    if (!point || typeof point !== 'object') continue
    const lon = (point as { lon?: unknown }).lon
    const lat = (point as { lat?: unknown }).lat
    if (typeof lon !== 'number' || typeof lat !== 'number') continue
    points.push([lon, lat])
  }
  return points
}

/** Join way pieces that share an endpoint into closed shoreline rings. */
function stitchRings(lines: [number, number][][]): [number, number][][] {
  const pool = lines.filter((line) => line.length >= 2).map((line) => line.slice())
  const rings: [number, number][][] = []
  while (pool.length > 0) {
    const chain = pool.pop()
    if (!chain) break
    let progressed = true
    while (progressed && !closeEnough(chain[0]!, chain[chain.length - 1]!)) {
      progressed = false
      for (let i = 0; i < pool.length; i += 1) {
        const other = pool[i]!
        const head = chain[0]!
        const tail = chain[chain.length - 1]!
        const start = other[0]!
        const end = other[other.length - 1]!
        if (closeEnough(tail, start)) chain.push(...other.slice(1))
        else if (closeEnough(tail, end)) chain.push(...other.slice(0, -1).reverse())
        else if (closeEnough(head, end)) chain.unshift(...other.slice(0, -1))
        else if (closeEnough(head, start)) chain.unshift(...other.slice(1).reverse())
        else continue
        pool.splice(i, 1)
        progressed = true
        break
      }
    }
    if (isClosedRing(chain)) rings.push(chain)
  }
  return rings
}

type OverpassElement = {
  type?: unknown
  id?: unknown
  tags?: Record<string, unknown>
  geometry?: { lat?: unknown; lon?: unknown }[]
  members?: { type?: unknown; role?: unknown; geometry?: unknown }[]
}

/** Lakes, bays, and riverbanks stored as relations, plus a coastline relation. */
function relationWater(row: OverpassElement): OsmWay[] {
  if (typeof row.id !== 'number' || !Array.isArray(row.members)) return []
  const natural = row.tags?.natural
  const waterway = typeof row.tags?.waterway === 'string' ? row.tags.waterway : null
  const coast = natural === 'coastline'
  const wet = natural === 'water' || natural === 'bay' || waterway === 'riverbank'
  const sandy = natural === 'beach' || natural === 'sand'
  if (!coast && !wet && !sandy) return []
  const name = typeof row.tags?.name === 'string' ? row.tags.name : null
  const water =
    typeof row.tags?.water === 'string' ? row.tags.water : natural === 'bay' ? 'bay' : 'water'
  const lines: [number, number][][] = []
  for (const member of row.members) {
    if (!member || member.role === 'inner') continue
    const line = asLonLatLine(member.geometry)
    if (line.length >= 2) lines.push(line)
  }
  if (coast && !wet) {
    return lines.map((points) => ({
      id: row.id as number,
      osmType: 'relation' as const,
      name,
      kind: 'coastline' as const,
      water: null,
      waterway: null,
      points,
    }))
  }
  const rings = stitchRings(lines)
  if (sandy && !wet) {
    return rings.map((points) => ({ id: row.id as number, osmType: 'relation' as const, name, kind: 'sand' as const, points }))
  }
  return rings.map((points) => ({
    id: row.id as number,
    osmType: 'relation' as const,
    name,
    kind: 'water' as const,
    water,
    waterway,
    points,
  }))
}

function keptTags(raw: Record<string, unknown> | undefined) {
  const tags: Record<string, string> = {}
  for (const key of KEEP_TAGS) {
    const value = raw?.[key]
    if (typeof value === 'string') tags[key] = value
  }
  // The OSM layer (below ground when negative) travels as layer:osm, so it
  // never overwrites the scene's own layer (road, building, …).
  if (typeof raw?.layer === 'string') tags['layer:osm'] = raw.layer
  return tags
}

/**
 * Buildings and building parts mapped as multipolygon relations (SF City
 * Hall's outline and its ground floors are). Their member ways carry no
 * tags, so the relation is the only place the shape and height live. Outer
 * members are stitched into closed rings, one shape per ring. Inner rings
 * (courtyards) are left out: the city extrudes plain outlines.
 */
function relationBuilding(row: OverpassElement): OsmWay[] {
  if (typeof row.id !== 'number' || !Array.isArray(row.members)) return []
  const part = typeof row.tags?.['building:part'] === 'string'
  const building = !part && typeof row.tags?.building === 'string'
  if (!part && !building) return []
  const lines: [number, number][][] = []
  for (const member of row.members) {
    if (!member || member.role === 'inner') continue
    const line = asLonLatLine(member.geometry)
    if (line.length >= 2) lines.push(line)
  }
  const name = typeof row.tags?.name === 'string' ? row.tags.name : null
  const tags = keptTags(row.tags)
  return stitchRings(lines).map((points) => ({
    id: row.id as number,
    osmType: 'relation' as const,
    name,
    kind: part ? ('part' as const) : ('building' as const),
    highway: null,
    building: building ? String(row.tags?.building) : null,
    water: null,
    waterway: null,
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
    points,
  }))
}

/** A man_made=bridge relation: its outer ways stitched into deck outlines. */
function relationBridge(row: OverpassElement): OsmWay[] {
  if (typeof row.id !== 'number' || !Array.isArray(row.members)) return []
  if (row.tags?.man_made !== 'bridge') return []
  const lines: [number, number][][] = []
  for (const member of row.members) {
    if (!member || member.role === 'inner') continue
    const line = asLonLatLine(member.geometry)
    if (line.length >= 2) lines.push(line)
  }
  const name = typeof row.tags?.name === 'string' ? row.tags.name : null
  const tags = keptTags(row.tags)
  return stitchRings(lines).map((points) => ({
    id: row.id as number,
    name,
    kind: 'bridge' as const,
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
    points,
  }))
}

/** Read way geometries from an Overpass JSON body. */
export function waysFromOverpass(body: unknown): OsmWay[] {
  if (!body || typeof body !== 'object') return []
  const elements = (body as { elements?: unknown }).elements
  if (!Array.isArray(elements)) return []
  const ways: OsmWay[] = []
  // Route relations' colour and ref, per rail way id.
  const railRefs = railRefsFrom(elements)
  const seenRail = new Set<string>()
  for (const element of elements) {
    if (!element || typeof element !== 'object') continue
    const row = element as OverpassElement
    if (row.type === 'relation') {
      const shapes = relationBuilding(row)
      ways.push(...(shapes.length > 0 ? shapes : relationWater(row)), ...relationBridge(row))
      continue
    }
    if (row.type === 'node') {
      const tree = treeNode(row)
      if (tree) {
        ways.push(tree)
        continue
      }
      const station = stationNode(row)
      if (station && !seenRail.has(`station:${station.id}`)) {
        seenRail.add(`station:${station.id}`)
        ways.push(station)
      }
      continue
    }
    if (typeof row.id !== 'number' || !Array.isArray(row.geometry)) continue
    const points: [number, number][] = []
    for (const point of row.geometry) {
      if (typeof point?.lon !== 'number' || typeof point?.lat !== 'number') continue
      points.push([point.lon, point.lat])
    }
    if (points.length < 2) continue
    // Track and platforms. A platform canopy mapped as a building stays a building.
    const shell = typeof row.tags?.building === 'string' || typeof row.tags?.['building:part'] === 'string'
    const railKind = shell ? null : railWayKind(row.tags)
    // highway=platform is a platform edge, not a street.
    if (row.tags?.highway === 'platform' && !shell && railKind !== 'platform') continue
    if (railKind && (railKind === 'platform' || typeof row.tags?.highway !== 'string')) {
      if (seenRail.has(`${railKind}:${row.id}`)) continue
      seenRail.add(`${railKind}:${row.id}`)
      ways.push(railWay(row, railKind, points, railRefs.get(row.id)))
      continue
    }
    const part = typeof row.tags?.['building:part'] === 'string'
    const building = !part && typeof row.tags?.building === 'string'
    const highway = typeof row.tags?.highway === 'string'
    const coastline = row.tags?.natural === 'coastline'
    if (row.tags?.natural === 'tree_row') {
      const trees = treeRowPoints(points)
      if (trees.length) ways.push({ id: row.id as number, name: null, kind: 'tree', tags: {}, points: trees })
      continue
    }
    const natural = row.tags?.natural === 'water' || row.tags?.natural === 'bay'
    // Beaches and sand: drawn as sand, kept free of trees.
    const sandy = (row.tags?.natural === 'beach' || row.tags?.natural === 'sand') && isClosedRing(points)
    const water = typeof row.tags?.water === 'string' ? row.tags.water : null
    const waterway = typeof row.tags?.waterway === 'string' ? row.tags.waterway : null
    const riverbank = waterway === 'riverbank'
    const name = typeof row.tags?.name === 'string' ? row.tags.name : null
    if (highway && (OFF_STREET.has(String(row.tags?.highway)) || underground(row.tags))) continue
    const outline = row.tags?.man_made === 'bridge' && isClosedRing(points)
    const kind = part
      ? 'part'
      : building
        ? 'building'
        : highway
          ? 'road'
          : outline
            ? 'bridge'
            : coastline
            ? 'coastline'
            : natural || water || (riverbank && isClosedRing(points))
              ? 'water'
              : riverbank || waterway === 'river' || waterway === 'stream' || waterway === 'canal'
                ? 'waterway'
                : sandy
                  ? 'sand'
                  : null
    if (!kind) continue
    const tags = keptTags(row.tags)
    const width = kind === 'road' ? resolveRoadWidth(row.tags ?? {}) : null
    ways.push({
      id: row.id,
      name,
      kind,
      highway: highway ? String(row.tags?.highway) : null,
      building: building ? String(row.tags?.building) : null,
      water: water ?? (riverbank ? 'river' : row.tags?.natural === 'bay' ? 'bay' : null),
      waterway: riverbank ? 'river' : waterway,
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

/** The request timeout, plus the caller's own cancel when there is one. */
function requestSignal(signal?: AbortSignal, ms = 60000) {
  const timeout = AbortSignal.timeout(ms)
  if (!signal) return timeout
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal
}

/** Ask the MORROW API, which answers from its cache or asks Overpass itself. */
async function viaApi(query: string, signal?: AbortSignal): Promise<unknown | undefined> {
  if (!OSM_API || Date.now() < apiDownUntil) return undefined
  try {
    const res = await fetch(OSM_API, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: requestSignal(signal, 90000),
    })
    if (res.ok) return await res.json()
    // The API reached Overpass and every server said no: asking them again
    // from the browser is unlikely to go better, but costs little.
    if (res.status < 500) return undefined
  } catch {
    signal?.throwIfAborted()
  }
  apiDownUntil = Date.now() + 60000
  return undefined
}

/** Wait for the response to start, but no longer than FIRST_BYTE_MS. */
async function firstByte(work: Promise<Response>, ms: number): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms)
  })
  return Promise.race([work, limit]).finally(() => clearTimeout(timer))
}

/**
 * POST one query: the MORROW API first, then each public server in turn
 * until one answers. Requests stay one at a time: the next server is asked
 * only after the last one failed. A cancel from the caller stops at once.
 */
export async function postOverpass(
  query: string,
  signal?: AbortSignal,
  send: typeof fetch = fetch,
): Promise<unknown> {
  if (send === fetch) {
    const cached = await viaApi(query, signal)
    if (cached !== undefined) return cached
  }
  let lastError: unknown = new Error('Overpass unreachable')
  for (const url of endpointOrder(workingEndpoint)) {
    signal?.throwIfAborted()
    let res: Response
    try {
      res = await firstByte(
        send(url, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ data: query }),
          signal: requestSignal(signal),
        }),
        FIRST_BYTE_MS,
      )
    } catch (error) {
      signal?.throwIfAborted()
      lastError = error
      continue
    }
    if (res.ok) {
      workingEndpoint = url
      return res.json()
    }
    lastError = new Error(`Overpass ${res.status}`)
    if (!tryNextEndpoint(res.status)) break
  }
  throw lastError
}

async function interpret(query: string, signal?: AbortSignal): Promise<OsmWay[]> {
  return waysFromOverpass(await postOverpass(query, signal))

}

/** A rail track or platform way, with its line colour from route relations. */
function railWay(
  row: OverpassElement,
  kind: 'rail' | 'platform',
  points: [number, number][],
  ref: RailRef | undefined,
): OsmWay {
  const name = typeof row.tags?.name === 'string' ? row.tags.name : null
  const tags = railTags(row.tags)
  const refs = ref?.refs.length ? ref.refs.join(';') : (tags.ref ?? null)
  return {
    id: row.id as number,
    name,
    kind,
    tags,
    points,
    lineColour: kind === 'rail' ? lineColour(tags, ref, name) : null,
    lineRef: refs,
  }
}

/** A tree mapped as an OSM node (natural=tree), with its leaf type when known. */
function treeNode(row: OverpassElement & { lat?: unknown; lon?: unknown }): OsmWay | null {
  if (row.tags?.natural !== 'tree') return null
  if (typeof row.id !== 'number' || typeof row.lat !== 'number' || typeof row.lon !== 'number') return null
  const leaf = row.tags?.leaf_type
  return {
    id: row.id,
    name: null,
    kind: 'tree',
    tags: typeof leaf === 'string' ? { leaf_type: leaf } : {},
    points: [[row.lon, row.lat]],
  }
}

/** Trees every ~9 m along a mapped tree row, as [longitude, latitude]. */
export function treeRowPoints(line: [number, number][], spacingMetres = 9): [number, number][] {
  const out: [number, number][] = []
  const lat0 = line[0]?.[1] ?? 0
  const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  const my = 110_540
  let carry = spacingMetres / 2
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [ax, ay] = line[i]!
    const [bx, by] = line[i + 1]!
    const len = Math.hypot((bx - ax) * mx, (by - ay) * my)
    for (let d = carry; d < len; d += spacingMetres) out.push([ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len])
    carry = (carry - len) % spacingMetres
    if (carry < 0) carry += spacingMetres
  }
  return out
}

/** Stations, stops, and subway entrances are OSM nodes. */
function stationNode(row: OverpassElement & { lat?: unknown; lon?: unknown }): OsmWay | null {
  const railway = row.tags?.railway
  if (typeof row.id !== 'number' || typeof row.lat !== 'number' || typeof row.lon !== 'number') return null
  if (typeof railway !== 'string' || !(STATION_NODE_TYPES as readonly string[]).includes(railway)) return null
  return {
    id: row.id,
    name: typeof row.tags?.name === 'string' ? row.tags.name : null,
    kind: 'station',
    tags: railTags(row.tags),
    points: [[row.lon, row.lat]],
  }
}

/** One grid tile, downloaded around its snapped center. */
export function fetchTile(key: string, signal?: AbortSignal): Promise<OsmWay[]> {
  return interpret(tileQuery(key), signal)
}

/**
 * The big bridges around a place, wider than any street tile: long
 * motorway, trunk, and primary bridge ways plus large bridge outlines.
 * Failure returns nothing so the city still loads.
 */
export async function fetchLandmarkBridges(lng: number, lat: number): Promise<OsmWay[]> {
  try {
    return (await interpret(landmarkQuery(tileKey(lng, lat)))).filter((way) => way.kind === 'bridge' || (way.kind === 'road' && way.tags?.bridge))
  } catch {
    return []
  }
}

/**
 * Ocean shoreline around a place. Wider than a street tile, and only the
 * coastline: water is on the right of these ways. Failure returns nothing
 * so the city still loads.
 */
export async function fetchCoastline(lng: number, lat: number): Promise<OsmWay[]> {
  try {
    return (await interpret(coastQuery(tileKey(lng, lat)))).filter((way) => way.kind === 'coastline')
  } catch {
    return []
  }
}

function withCoast(ways: OsmWay[], coast: OsmWay[]) {
  const seen = new Set(ways.map(wayKey))
  return [...ways, ...coast.filter((way) => !seen.has(wayKey(way)))]
}

function describe(place: UsPlace, ways: OsmWay[]) {
  const roads = ways.filter((way) => way.kind === 'road').length
  const buildings = ways.filter((way) => way.kind === 'building').length
  const water = ways.filter((way) => way.kind === 'water' || way.kind === 'waterway' || way.kind === 'coastline').length
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
    // Busy servers (429, 502) often answer a few seconds later: when every
    // server said no quickly, ask once more before settling for the
    // stand-in. After slow timeouts, do not make the resident wait again.
    // The first view is the place's own grid tile, so it is downloaded once
    // (not again as a background tile) and the API can serve it from cache.
    // Coastline and big bridges come at the same time, not after.
    const key = tileKey(place.lng, place.lat)
    const asked = Date.now()
    const coastAndBridges = Promise.all([
      fetchCoastline(place.lng, place.lat),
      fetchLandmarkBridges(place.lng, place.lat),
    ])
    const streets = await fetchTile(key).catch(async (error: unknown) => {
      if (Date.now() - asked > RETRY_WITHIN_MS) throw error
      await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS))
      return fetchTile(key)
    })
    const [coast, landmarks] = await coastAndBridges
    const ways = withCoast(withCoast(streets, coast), landmarks)
    if (ways.length > 0) {
      return { place, ways, note: describe(place, ways), tiles: [key] }
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
 * Add downloaded tiles to the neighborhood. Ways already loaded (the
 * preview overlaps its grid tiles) are kept once.
 */
export function mergeAreas(
  neighborhood: LoadedNeighborhood,
  fresh: OsmWay[],
  keys: string[],
): LoadedNeighborhood {
  const tiles = neighborhood.tiles ?? []
  if (neighborhood.procedural) return neighborhood
  const seen = new Set(neighborhood.ways.map(wayKey))
  const added = fresh.filter((way) => !seen.has(wayKey(way)))
  const ways = [...neighborhood.ways]
  for (const way of added) {
    const id = wayKey(way)
    // Tiles in one batch share the ways that cross their edge.
    if (seen.has(id)) continue
    seen.add(id)
    ways.push(way)
  }
  const newKeys = keys.filter((key) => !tiles.includes(key))
  return { ...neighborhood, ways, tiles: [...tiles, ...newKeys], note: describe(neighborhood.place, ways) }
}

/** Rail track, platforms, and stations as basemap features. */
function railFeature(way: OsmWay) {
  const base = { ...way.tags, osmId: way.id, name: way.name }
  if (way.kind === 'station') {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: way.points[0] },
      properties: { ...base, layer: 'station' },
    }
  }
  if (way.kind === 'platform') {
    const closed = way.points.length >= 4 && isClosedRing(way.points)
    return {
      type: 'Feature',
      geometry: closed
        ? { type: 'Polygon', coordinates: [way.points] }
        : { type: 'LineString', coordinates: way.points },
      properties: { ...base, layer: 'rail_platform' },
    }
  }
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: way.points },
    properties: {
      ...base,
      layer: 'rail',
      colour: way.lineColour ?? null,
      ref: way.lineRef ?? way.tags?.ref ?? null,
    },
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
    if (way.kind === 'tree') {
      features.push({
        type: 'Feature',
        geometry: { type: 'MultiPoint', coordinates: way.points },
        properties: { osmId: way.id, layer: 'tree', leaf: way.tags?.leaf_type ?? null },
      })
      continue
    }
    if (way.kind === 'sand') {
      if (way.points.length < 3) continue
      const ring = [...way.points]
      const [first] = ring
      const last = ring[ring.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first)
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { osmId: way.id, layer: 'sand', name: way.name },
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
    if (way.kind === 'bridge') {
      if (way.points.length < 3) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [way.points] },
        properties: { ...way.tags, osmId: way.id, layer: 'bridge', name: way.name },
      })
      continue
    }
    if (way.kind === 'coastline') {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: way.points },
        properties: { osmId: way.id, layer: 'coastline', name: way.name },
      })
      continue
    }
    if (way.kind === 'rail' || way.kind === 'platform' || way.kind === 'station') {
      features.push(railFeature(way))
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
          // Relations keep their `r` so they never share a key with a way of the same number.
          osmId: osmRef(way),
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
