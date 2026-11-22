import type { UsPlace } from './places.ts'

/**
 * "Use my location" in the address bar. The point goes only to the
 * geocoder the address bar already uses; it is never stored.
 */

const REVERSE =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode'

/** Coarse is enough to pick a neighborhood, and a recent fix is reused. */
export const LOCATE_OPTIONS: {
  enableHighAccuracy: boolean
  timeout: number
  maximumAge: number
} = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60_000,
}

/** Browsers only offer geolocation on HTTPS and localhost. */
export function canUseLocation(env: { isSecureContext?: boolean; geolocation?: unknown }): boolean {
  return env.isSecureContext === true && Boolean(env.geolocation)
}

/** GeolocationPositionError codes: 1 denied, 2 unavailable, 3 timeout. */
export function locationErrorMessage(code: number | undefined): string {
  if (code === 1) return 'Location is off for this site.'
  if (code === 2) return 'Your location is not available right now.'
  if (code === 3) return 'Finding your location took too long. Try again.'
  return 'Could not find your location.'
}

export const OUTSIDE_US_MESSAGE = 'Your location is outside the US. MORROW maps US places only.'
export const NO_PLACE_MESSAGE = 'No place name was found for your location.'

/** The same rough box placeFromEsri uses for a US match. */
function inUsBox(lng: number, lat: number) {
  return lat >= 15 && lat <= 72 && lng >= -180 && lng <= -60
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export type ReversePlace = UsPlace & { inUs: boolean }

/**
 * Turn an Esri reverseGeocode body into a label the address bar can search.
 * The label is "street, city, ST, zip" so a named place (a park, a shop)
 * still resolves to its own street, not a same-named place elsewhere.
 */
export function placeFromReverseEsri(body: unknown): ReversePlace | null {
  if (!body || typeof body !== 'object') return null
  if ((body as { error?: unknown }).error) return null
  const address = (body as { address?: unknown }).address
  const location = (body as { location?: { x?: unknown; y?: unknown } }).location
  if (!address || typeof address !== 'object') return null
  const lng = location?.x
  const lat = location?.y
  if (typeof lng !== 'number' || typeof lat !== 'number') return null
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const a = address as Record<string, unknown>
  const street = text(a.Address)
  const city = text(a.City)
  const region = text(a.RegionAbbr) || text(a.Region)
  const postal = text(a.Postal)
  const parts = [street, city, region, postal].filter(Boolean)
  const label =
    (street || city) && parts.length > 1
      ? parts.join(', ')
      : text(a.LongLabel).replace(/, USA$/, '') || text(a.Match_addr)
  if (!label) return null
  const country = text(a.CountryCode)
  const inUs = country ? country === 'USA' : inUsBox(lng, lat)
  const town = city ? (region ? `${city}, ${region}` : city) : undefined
  const addrType = text(a.Addr_type) || undefined
  return {
    label,
    lng,
    lat,
    inUs,
    ...(town ? { town } : {}),
    ...(addrType ? { addrType } : {}),
  }
}

/** Name the place at a point with the address bar's geocoder. */
export async function reverseGeocode(lng: number, lat: number): Promise<ReversePlace | null> {
  const url = new URL(REVERSE)
  url.searchParams.set('f', 'json')
  url.searchParams.set('location', `${lng},${lat}`)
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  return placeFromReverseEsri(await res.json())
}
