/**
 * Pure scheduling rules for loading a city tile by tile: which tile comes
 * next, how long to wait after a failure, and when finished tiles are
 * handed to the 3D city. No React and no network, so tests can import it.
 *
 * Tile keys are "ix:iy" grid indices, as made by tileKey in overpass.ts.
 */

/** Tiles in each direction around the place's own tile: 2 → a 5×5 block. */
export const BACKGROUND_RADIUS = 2
/** Never more than this many tiles in one city, however far you look. */
export const TILE_LIMIT = 80
/** How far the camera sees in scene units: the far edge of the fog (~2.4 km). */
export const VIEW_FAR = 340
/** How often the visible ground is worked out again as the view changes. */
export const VIEW_EVERY_MS = 1500
/** The camera must rest this long before tiles out of view fill in around the place. */
export const IDLE_FILL_MS = 4000
/** Pause between two Overpass requests, so a public server is not hammered. */
export const REQUEST_GAP_MS = 3000
/** Wait after 1, 2, and 3+ failures in a row (rate limit, timeout, or error). */
export const BACKOFF_MS = [5000, 15000, 60000] as const
/** A tile is retried this many times before it is given up on. */
export const MAX_RETRIES = 2
/** Past this many buildings the city is big enough; background loading stops. */
export const BUILDING_LIMIT = 60_000
/** Finished tiles wait at most this long before they join the city. */
export const COMMIT_EVERY_MS = 8000
/** …or join as soon as this many are waiting. */
export const COMMIT_TILES = 3
/**
 * The camera must have been still this long, so a rebuild never interrupts
 * a move. A pause between two scrolls is shorter than this.
 */
export const STILL_MS = 3000
/** Even the tile you are walking toward waits for this much of a pause. */
export const URGENT_STILL_MS = 600

export type TileIndex = { x: number; y: number }

export function parseTile(key: string): TileIndex | null {
  const [a, b] = key.split(':')
  const x = Number(a)
  const y = Number(b)
  return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null
}

export function tileKeyOf(x: number, y: number) {
  return `${x}:${y}`
}

/**
 * Tiles in square rings around `origin`: ring r holds the tiles with
 * max(|dx|, |dy|) = r. Within a ring, tiles in front of the camera come
 * first. `view` is where the camera is and which way it faces, both in
 * tile units (x east, y north).
 */
export function ringOrder(
  origin: string,
  radius: number,
  view?: { x: number; y: number; dirX: number; dirY: number },
): string[] {
  const o = parseTile(origin)
  if (!o) return []
  const out: string[] = [origin]
  for (let r = 1; r <= radius; r += 1) {
    const ring: { key: string; score: number; dist: number }[] = []
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = o.x + dx
        const y = o.y + dy
        const fromX = x - (view?.x ?? o.x)
        const fromY = y - (view?.y ?? o.y)
        const dist = Math.hypot(fromX, fromY)
        const len = Math.hypot(view?.dirX ?? 0, view?.dirY ?? 0)
        // Cosine between the facing direction and the way to the tile.
        const score = view && len > 0 && dist > 0 ? (fromX * view.dirX + fromY * view.dirY) / (dist * len) : 0
        ring.push({ key: tileKeyOf(x, y), score, dist })
      }
    }
    ring.sort((a, b) => b.score - a.score || a.dist - b.dist || a.key.localeCompare(b.key))
    out.push(...ring.map((tile) => tile.key))
  }
  return out
}

/**
 * The next tile to download: edge-of-view tiles first, in the order they
 * were asked for, then what the camera can see, nearest first, then the
 * rings around the place. Tiles already loaded, given up on, or
 * downloading are skipped. Null when nothing is left.
 */
export function nextTile(options: {
  urgent: readonly string[]
  view?: readonly string[]
  background: readonly string[]
  skip: (key: string) => boolean
}): { key: string; urgent: boolean } | null {
  for (const key of options.urgent) if (!options.skip(key)) return { key, urgent: true }
  for (const key of options.view ?? []) if (!options.skip(key)) return { key, urgent: false }
  for (const key of options.background) if (!options.skip(key)) return { key, urgent: false }
  return null
}

/** Wait before the next request after `failures` failures in a row (0 = the usual gap). */
export function backoffDelay(failures: number): number {
  if (failures <= 0) return REQUEST_GAP_MS
  return BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1]!
}

/** True once a tile has failed more often than it may be retried. */
export function givesUp(attempts: number): boolean {
  return attempts > MAX_RETRIES
}

/**
 * Whether the waiting tiles should join the city now. Joining rebuilds
 * the city, which stalls a frame, so nothing joins mid-move. A tile at the
 * edge of the view goes in at the first short pause; background tiles
 * wait for a batch or a few seconds, and for the camera to rest.
 */
export function shouldCommit(options: {
  pending: number
  urgent: boolean
  sinceCommitMs: number
  stillMs: number
}): boolean {
  if (options.pending <= 0) return false
  if (options.urgent) return options.stillMs >= URGENT_STILL_MS
  if (options.stillMs < STILL_MS) return false
  return options.pending >= COMMIT_TILES || options.sinceCommitMs >= COMMIT_EVERY_MS
}

type Vec3 = readonly [number, number, number]
type Point = readonly [number, number]

export type ViewCamera = {
  /** Camera position in scene units (y up). */
  eye: Vec3
  /** The point it looks at. */
  target: Vec3
  /** Vertical field of view in degrees. */
  fov: number
  /** Width over height. */
  aspect: number
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/**
 * The ground the camera can see, as a polygon of scene [x, z] points:
 * rays through the edge of the screen meet the ground (y = 0). Rays that
 * reach past `far`, or point above the horizon, stop at `far` from the
 * camera, where the fog hides everything anyway.
 */
export function groundFootprint(camera: ViewCamera, far: number, perEdge = 4): Point[] {
  const [ex, ey, ez] = camera.eye
  const forward = normalize([
    camera.target[0] - ex,
    camera.target[1] - ey,
    camera.target[2] - ez,
  ])
  let right = cross(forward, [0, 1, 0])
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0]
  right = normalize(right)
  const up = cross(right, forward)
  const tanV = Math.tan(((camera.fov || 50) * Math.PI) / 360)
  const tanH = tanV * (camera.aspect || 1)
  // Around the screen's edge, in order, so the hits form a polygon.
  const screen: Point[] = []
  for (let i = 0; i < perEdge; i += 1) {
    const t = -1 + (2 * i) / perEdge
    screen.push([t, -1])
  }
  for (let i = 0; i < perEdge; i += 1) screen.push([1, -1 + (2 * i) / perEdge])
  for (let i = 0; i < perEdge; i += 1) screen.push([1 - (2 * i) / perEdge, 1])
  for (let i = 0; i < perEdge; i += 1) screen.push([-1, 1 - (2 * i) / perEdge])
  const height = Math.max(ey, 0)
  return screen.map(([sx, sy]) => {
    const dir: Vec3 = [
      forward[0] + right[0] * sx * tanH + up[0] * sy * tanV,
      forward[1] + right[1] * sx * tanH + up[1] * sy * tanV,
      forward[2] + right[2] * sx * tanH + up[2] * sy * tanV,
    ]
    const flat = Math.hypot(dir[0], dir[2])
    if (flat < 1e-9) return [ex, ez] as const
    let reach = far
    // Pointing down: where it meets the ground, unless that is past the fog.
    if (dir[1] < -1e-6) reach = Math.min(far, (height / -dir[1]) * flat)
    return [ex + (dir[0] / flat) * reach, ez + (dir[2] / flat) * reach] as const
  })
}

function insidePolygon(x: number, y: number, polygon: readonly Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const side = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = side(c, d, a)
  const d2 = side(c, d, b)
  const d3 = side(a, b, c)
  const d4 = side(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** True when the polygon and the square [x0, x1] × [y0, y1] overlap at all. */
function touchesSquare(polygon: readonly Point[], x0: number, y0: number, x1: number, y1: number) {
  if (polygon.some(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) return true
  const corners: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  if (corners.some(([x, y]) => insidePolygon(x, y, polygon))) return true
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    for (let k = 0; k < 4; k += 1) {
      if (segmentsCross(a, b, corners[k]!, corners[(k + 1) % 4]!)) return true
    }
  }
  return false
}

/**
 * Every tile the camera can see, nearest to what it looks at first. Tiles
 * farther than `far` from the camera target are left out, and at most
 * `maxTiles` are returned. `unproject` and `project` convert between
 * scene [x, z] and [longitude, latitude]; `tileDeg` is a tile's size in
 * degrees (keys are round(lng / tileDeg):round(lat / tileDeg)).
 */
export function viewTiles(options: {
  camera: ViewCamera
  far: number
  tileDeg: number
  unproject: (x: number, z: number) => readonly [number, number]
  project: (lng: number, lat: number) => readonly [number, number]
  maxTiles?: number
}): string[] {
  const { camera, far, tileDeg, unproject, project } = options
  const ground = groundFootprint(camera, far)
  // Grid units: tile (i, j) covers [i - 0.5, i + 0.5] × [j - 0.5, j + 0.5].
  const grid = ground.map(([x, z]) => {
    const [lng, lat] = unproject(x, z)
    return [lng / tileDeg, lat / tileDeg] as const
  })
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of grid) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (!Number.isFinite(minX)) return []
  const [tx, , tz] = camera.target
  const found: { key: string; dist: number }[] = []
  for (let j = Math.round(minY); j <= Math.round(maxY); j += 1) {
    for (let i = Math.round(minX); i <= Math.round(maxX); i += 1) {
      if (!touchesSquare(grid, i - 0.5, j - 0.5, i + 0.5, j + 0.5)) continue
      // Distance from the target to the nearest point of the tile, in scene units.
      const [ax, az] = project((i - 0.5) * tileDeg, (j - 0.5) * tileDeg)
      const [bx, bz] = project((i + 0.5) * tileDeg, (j + 0.5) * tileDeg)
      const dx = Math.max(Math.min(ax, bx) - tx, 0, tx - Math.max(ax, bx))
      const dz = Math.max(Math.min(az, bz) - tz, 0, tz - Math.max(az, bz))
      const dist = Math.hypot(dx, dz)
      if (dist > far) continue
      // Ties (tiles the target sits in or touches) go by their middle.
      const mid = Math.hypot((ax + bx) / 2 - tx, (az + bz) / 2 - tz)
      found.push({ key: tileKeyOf(i, j), dist: dist + mid * 1e-6 })
    }
  }
  found.sort((a, b) => a.dist - b.dist || a.key.localeCompare(b.key))
  return found.slice(0, options.maxTiles ?? TILE_LIMIT).map((tile) => tile.key)
}
