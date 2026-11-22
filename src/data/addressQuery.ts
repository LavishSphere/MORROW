import type { UsPlace } from './places.ts'

/** Longitude / latitude box of the city on screen. */
export type MapBox = { west: number; south: number; east: number; north: number }

/** Degrees of slack around the map edge before an address counts as outside. */
export const ADDRESS_EDGE = 0.003

/**
 * keep-city: a city or town query, and that city is already on screen.
 * load-city: a different city or town, shown as the city view (no camera focus).
 * focus: a street address already inside the city on screen.
 * load-and-focus: a street address somewhere else; load it, then focus.
 */
export type AddressDecision = 'keep-city' | 'load-city' | 'focus' | 'load-and-focus'

const CITY_TYPES = new Set(['Locality', 'City', 'Town'])
const ADDRESS_TYPES = new Set([
  'PointAddress',
  'StreetAddress',
  'Subaddress',
  'StreetInt',
  'StreetName',
  'POI',
  'DistanceMarker',
])

/** A city or town, as opposed to a street address or a named place. */
export function isCityOrTown(place: UsPlace): boolean {
  if (place.addrType) {
    if (CITY_TYPES.has(place.addrType)) return true
    if (ADDRESS_TYPES.has(place.addrType)) return false
  }
  const head = place.label.split(',')[0]?.trim() ?? ''
  return head.length > 0 && !/\d/.test(head)
}

export function insideCity(box: MapBox, lng: number, lat: number) {
  return (
    lng >= box.west - ADDRESS_EDGE &&
    lng <= box.east + ADDRESS_EDGE &&
    lat >= box.south - ADDRESS_EDGE &&
    lat <= box.north + ADDRESS_EDGE
  )
}

function sameTown(place: UsPlace, currentTown: string) {
  if (!place.town || !currentTown.trim()) return false
  return place.town.trim().toLowerCase() === currentTown.trim().toLowerCase()
}

/**
 * A city or town query keeps the city view. A street address in the city
 * on screen only moves the camera. An address in another city loads that
 * place and then focuses.
 */
export function decideAddressQuery(
  place: UsPlace,
  box: MapBox | null,
  currentTown: string,
): AddressDecision {
  if (isCityOrTown(place)) {
    if (sameTown(place, currentTown) || (box !== null && insideCity(box, place.lng, place.lat))) {
      return 'keep-city'
    }
    return 'load-city'
  }
  if (box !== null && insideCity(box, place.lng, place.lat)) return 'focus'
  return 'load-and-focus'
}
