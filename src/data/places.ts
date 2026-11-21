export type UsPlace = {
  label: string
  lng: number
  lat: number
}

const GEOCODE =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'

/** Pull the first US match out of an Esri findAddressCandidates body. */
export function placeFromEsri(body: unknown): UsPlace | null {
  if (!body || typeof body !== 'object') return null
  const candidates = (body as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  const first = candidates[0]
  if (!first || typeof first !== 'object') return null
  const address = (first as { address?: unknown }).address
  const location = (first as { location?: { x?: unknown; y?: unknown } }).location
  const lng = location?.x
  const lat = location?.y
  if (typeof address !== 'string' || !address.trim()) return null
  if (typeof lng !== 'number' || typeof lat !== 'number') return null
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (lat < 15 || lat > 72 || lng < -180 || lng > -60) return null
  return { label: address.trim(), lng, lat }
}

/** Resolve a typed US place name to a point. Does not invent a match. */
export async function geocodeUsPlace(query: string): Promise<UsPlace | null> {
  const text = query.trim()
  if (text.length < 2) return null
  const url = new URL(GEOCODE)
  url.searchParams.set('f', 'json')
  url.searchParams.set('singleLine', text)
  url.searchParams.set('sourceCountry', 'USA')
  url.searchParams.set('maxLocations', '1')
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  return placeFromEsri(await res.json())
}
