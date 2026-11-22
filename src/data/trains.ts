import { bearingVector, NEUTRAL_TRACK, pointAlong, snapToLines, type Pt } from './rail.ts'
import type { LiveVehicle } from './transitLive.ts'

/**
 * Where trains are: live vehicles snapped onto mapped track and glided
 * between polls. Pure, so it runs in tests; the scene only draws the poses.
 */

/** A passenger track line the trains run on. */
export type TrackLine = {
  points: readonly Pt[]
  colour: string | null
  railway: string
  underground: boolean
  bridge: boolean
}

/** One car: center, unit heading, and whether it is below ground. */
export type CarPose = { x: number; z: number; dx: number; dz: number; along: number }

/** About 16 m: real cars are longer, but this reads better among the buildings. */
export const CAR_LENGTH = 2.3
export const CAR_GAP = 0.12
/** A live vehicle farther than this from track of its colour is not drawn (≈70 m). */
export const LIVE_REACH = 10
/** Farther than this between polls is a jump, not a glide. */
const MAX_GLIDE = 60

/** Cars per train: heavy rail and commuter trains 3, light rail and streetcars 2. */
export function consistSize(railway: string): number {
  if (railway === 'light_rail' || railway === 'tram' || railway === 'funicular') return 2
  return 3
}

/** Car poses: the front of the lead car at `along`, the rest trailing behind. */
export function consistPoses(points: readonly Pt[], along: number, dir: 1 | -1, cars: number): CarPose[] {
  const poses: CarPose[] = []
  for (let k = 0; k < cars; k += 1) {
    const a = along - dir * (k * (CAR_LENGTH + CAR_GAP) + CAR_LENGTH / 2)
    const p = pointAlong(points, a)
    poses.push({ x: p.x, z: p.z, dx: p.dx * dir, dz: p.dz * dir, along: a })
  }
  return poses
}

/** A live vehicle placed on a line: distance along it and which way it faces. */
export type LiveTarget = { id: string; line: number; along: number; dir: 1 | -1; colour: string; routeId: string }

/**
 * Snap each live vehicle to the nearest line of its colour and face it the
 * way its bearing points. Vehicles with no matching track nearby are left out.
 */
export function placeLiveVehicles(
  vehicles: readonly LiveVehicle[],
  lines: readonly TrackLine[],
  project: (lon: number, lat: number) => readonly [number, number],
): LiveTarget[] {
  const out: LiveTarget[] = []
  for (const vehicle of vehicles) {
    const [x, z] = project(vehicle.lon, vehicle.lat)
    const hit = snapToLines(x, z, lines, vehicle.color, LIVE_REACH)
    if (!hit) continue
    let dir: 1 | -1 = 1
    if (vehicle.bearing !== null) {
      const b = bearingVector(vehicle.bearing)
      dir = hit.snap.dx * b.dx + hit.snap.dz * b.dz >= 0 ? 1 : -1
    }
    out.push({
      id: vehicle.id,
      line: hit.index,
      along: hit.snap.along,
      dir,
      colour: lines[hit.index]?.colour ?? vehicle.color ?? NEUTRAL_TRACK,
      routeId: vehicle.routeId,
    })
  }
  return out
}

/** A glide from one snapped spot to the next, over one poll interval. */
export type Motion = {
  line: number
  from: number
  to: number
  start: number
  duration: number
  dir: 1 | -1
  colour: string
}

export function alongAt(motion: Motion, now: number): number {
  if (motion.duration <= 0) return motion.to
  const k = Math.max(0, Math.min(1, (now - motion.start) / motion.duration))
  return motion.from + (motion.to - motion.from) * k
}

/**
 * New glides after a poll: each train moves from where it is drawn now to
 * its new spot over `duration`. A new train, a change of line, or a big
 * jump starts in place. With reduced motion every train simply sits at its
 * reported spot.
 */
export function retarget(
  previous: ReadonlyMap<string, Motion>,
  targets: readonly LiveTarget[],
  now: number,
  duration: number,
  reduced: boolean,
): Map<string, Motion> {
  const next = new Map<string, Motion>()
  for (const target of targets) {
    const old = previous.get(target.id)
    let from = target.along
    if (!reduced && old && old.line === target.line) {
      const here = alongAt(old, now)
      if (Math.abs(target.along - here) < MAX_GLIDE) from = here
    }
    next.set(target.id, {
      line: target.line,
      from,
      to: target.along,
      start: now,
      duration: reduced ? 0 : duration,
      dir: target.dir,
      colour: target.colour,
    })
  }
  return next
}
