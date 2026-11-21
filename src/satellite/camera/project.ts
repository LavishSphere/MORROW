/** Wellesley showcase frame. Same bounds as data/wellesley/bbox.json. */
export const TOWN_FRAME = {
  west: -71.3085,
  south: 42.291,
  east: -71.3005,
  north: 42.2968,
  center: { lng: -71.3045, lat: 42.2939 },
} as const

export const TILE_SIZE = 256

const MAX_LAT = 85.05112878

export function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom
}

/** Web Mercator pixel position at a continuous zoom. */
export function lngLatToWorld(
  lng: number,
  lat: number,
  zoom: number,
): { x: number; y: number } {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)
  const size = worldSize(zoom)
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  }
}

/**
 * Largest zoom at which the whole town frame fits inside the viewport.
 * Binary search so a resize does not jump a full zoom level.
 */
export function fitTownZoom(width: number, height: number, padding = 72): number {
  const innerW = Math.max(32, width - padding * 2)
  const innerH = Math.max(32, height - padding * 2)
  let low = 2
  let high = 18
  for (let step = 0; step < 22; step += 1) {
    const mid = (low + high) / 2
    const nw = lngLatToWorld(TOWN_FRAME.west, TOWN_FRAME.north, mid)
    const se = lngLatToWorld(TOWN_FRAME.east, TOWN_FRAME.south, mid)
    const fits = Math.abs(se.x - nw.x) <= innerW && Math.abs(se.y - nw.y) <= innerH
    if (fits) low = mid
    else high = mid
  }
  return low
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}
