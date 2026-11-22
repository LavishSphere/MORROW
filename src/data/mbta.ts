import type { GeoBox, LiveFeed, LiveVehicle } from './transitLive.ts'

/**
 * MBTA live trains from the public V3 API: subway, light rail, and
 * Commuter Rail (route types 0, 1, 2). No key is needed; keyless clients
 * get 20 requests a minute, so one poll every 15 s leaves plenty of room.
 * The Silver Line is a bus (route type 3) and is not drawn as a train.
 */

/** The MBTA service area, Worcester and Wickford to Newburyport. */
export const MBTA_AREA: GeoBox = { west: -71.95, south: 41.55, east: -70.55, north: 42.9 }

export function inBostonArea(lon: number, lat: number): boolean {
  return lon >= MBTA_AREA.west && lon <= MBTA_AREA.east && lat >= MBTA_AREA.south && lat <= MBTA_AREA.north
}

export const MBTA_VEHICLES_URL =
  'https://api-v3.mbta.com/vehicles?filter[route_type]=0,1,2&include=route' +
  '&fields[vehicle]=latitude,longitude,bearing,current_status,direction_id,label,updated_at' +
  '&fields[route]=color,type'

type JsonApiRow = {
  id?: unknown
  type?: unknown
  attributes?: Record<string, unknown>
  relationships?: { route?: { data?: { id?: unknown } | null } }
}

/** Read the vehicles of one /vehicles?include=route response. */
export function parseMbtaVehicles(body: unknown): LiveVehicle[] {
  if (!body || typeof body !== 'object') return []
  const data = (body as { data?: unknown }).data
  const included = (body as { included?: unknown }).included
  if (!Array.isArray(data)) return []
  const colours = new Map<string, string>()
  for (const row of Array.isArray(included) ? (included as JsonApiRow[]) : []) {
    const colour = row?.attributes?.color
    if (row?.type === 'route' && typeof row.id === 'string' && typeof colour === 'string' && /^[0-9a-f]{6}$/i.test(colour)) {
      colours.set(row.id, `#${colour.toLowerCase()}`)
    }
  }
  const vehicles: LiveVehicle[] = []
  for (const row of data as JsonApiRow[]) {
    const a = row?.attributes
    const lat = a?.latitude
    const lon = a?.longitude
    if (typeof row?.id !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') continue
    const routeId = row.relationships?.route?.data?.id
    const route = typeof routeId === 'string' ? routeId : ''
    vehicles.push({
      id: row.id,
      lat,
      lon,
      bearing: typeof a?.bearing === 'number' ? a.bearing : null,
      routeId: route,
      color: colours.get(route) ?? null,
      status: typeof a?.current_status === 'string' ? a.current_status : null,
      updatedAt: typeof a?.updated_at === 'string' ? a.updated_at : '',
    })
  }
  return vehicles
}

export const mbtaFeed: LiveFeed = {
  id: 'mbta',
  label: 'MBTA',
  pollMs: 15_000,
  covers(bbox) {
    return inBostonArea((bbox.west + bbox.east) / 2, (bbox.south + bbox.north) / 2)
  },
  async fetch(signal) {
    const res = await fetch(MBTA_VEHICLES_URL, { signal, headers: { accept: 'application/vnd.api+json' } })
    if (!res.ok) throw Object.assign(new Error(`MBTA ${res.status}`), { status: res.status })
    return parseMbtaVehicles(await res.json())
  },
}
