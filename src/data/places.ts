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

const SUGGEST =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest'

export type CitySuggestion = {
  /** e.g. "Greenville, SC, USA" */
  label: string
  /** Esri key that pins the exact match when geocoding the pick. */
  magicKey: string
}

/** Pull usable city suggestions out of an Esri suggest body. */
export function suggestionsFromEsri(body: unknown): CitySuggestion[] {
  if (!body || typeof body !== 'object') return []
  const list = (body as { suggestions?: unknown }).suggestions
  if (!Array.isArray(list)) return []
  const out: CitySuggestion[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const { text, magicKey, isCollection } = item as {
      text?: unknown
      magicKey?: unknown
      isCollection?: unknown
    }
    if (isCollection === true) continue
    if (typeof text !== 'string' || !text.trim()) continue
    if (typeof magicKey !== 'string' || !magicKey) continue
    out.push({ label: text.trim(), magicKey })
  }
  return out
}

/** US cities that match what has been typed so far. */
export async function suggestUsCities(
  query: string,
  signal?: AbortSignal,
): Promise<CitySuggestion[]> {
  const text = query.trim()
  if (text.length < 2) return []
  const url = new URL(SUGGEST)
  url.searchParams.set('f', 'json')
  url.searchParams.set('text', text)
  url.searchParams.set('countryCode', 'USA')
  url.searchParams.set('category', 'City')
  url.searchParams.set('maxSuggestions', '10')
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal,
  })
  if (!res.ok) return []
  return suggestionsFromEsri(await res.json())
}

/** Addresses and named places inside a box (the loaded map). */
export async function suggestAddresses(
  query: string,
  box: { west: number; south: number; east: number; north: number },
  signal?: AbortSignal,
): Promise<CitySuggestion[]> {
  const text = query.trim()
  if (text.length < 3) return []
  const url = new URL(SUGGEST)
  url.searchParams.set('f', 'json')
  url.searchParams.set('text', text)
  url.searchParams.set('countryCode', 'USA')
  url.searchParams.set('searchExtent', `${box.west},${box.south},${box.east},${box.north}`)
  url.searchParams.set('location', `${(box.west + box.east) / 2},${(box.south + box.north) / 2}`)
  url.searchParams.set('maxSuggestions', '6')
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal,
  })
  if (!res.ok) return []
  return suggestionsFromEsri(await res.json())
}

/** Resolve a typed US place name to a point. Does not invent a match. */
export async function geocodeUsPlace(
  query: string,
  magicKey?: string,
): Promise<UsPlace | null> {
  const text = query.trim()
  if (text.length < 2) return null
  const url = new URL(GEOCODE)
  url.searchParams.set('f', 'json')
  url.searchParams.set('singleLine', text)
  if (magicKey) url.searchParams.set('magicKey', magicKey)
  url.searchParams.set('sourceCountry', 'USA')
  url.searchParams.set('maxLocations', '1')
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  return placeFromEsri(await res.json())
}
