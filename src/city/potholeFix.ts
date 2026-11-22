import { useSyncExternalStore } from 'react'
import type { DraftProposal } from '../types.ts'

export type PotholeIssue = {
  id: string
  label: string
}

/** Fallback holes before a city map adopts its own. Not a field survey. */
export const POTHOLES: readonly PotholeIssue[] = [
  { id: 'boulevard-pothole-1', label: 'Boulevard pothole, west of the bend' },
  { id: 'boulevard-pothole-2', label: 'Boulevard pothole, at the bend' },
  { id: 'boulevard-pothole-3', label: 'Boulevard pothole, east of the bend' },
]

export type RoadLine = {
  id: string
  name?: string
  points: readonly (readonly [number, number])[]
}

export type PlacedPothole = {
  issue: PotholeIssue
  x: number
  z: number
}

const HOLE_COUNT = 6

function roadLength(points: RoadLine['points']): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

function pointAlong(points: RoadLine['points'], fraction: number): { x: number; z: number } {
  const total = roadLength(points)
  const first = points[0] ?? [0, 0]
  if (total <= 0) return { x: first[0], z: first[1] }
  let goal = total * fraction
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (!a || !b) continue
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (goal <= len && len > 0) {
      const t = goal / len
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t }
    }
    goal -= len
  }
  const last = points[points.length - 1] ?? first
  return { x: last[0], z: last[1] }
}

function idJitter(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 33 + id.charCodeAt(i)) | 0
  return (Math.abs(hash) % 1000) / 1000
}

/**
 * Scatter illustrative holes along whatever roads a city has.
 * The same streets always get the same spots, so a patch stays put.
 */
export function scatterPotholes(roads: readonly RoadLine[]): PlacedPothole[] {
  const usable = roads
    .map((road) => ({ road, length: roadLength(road.points) }))
    .filter((item) => item.length > 0.15 && item.road.points.length >= 2)
    .sort((a, b) => b.length - a.length || a.road.id.localeCompare(b.road.id))
  if (usable.length === 0) return []

  const fractions = [0.27, 0.48, 0.71, 0.36, 0.62, 0.84]
  const spots: PlacedPothole[] = []
  for (let n = 0; n < HOLE_COUNT; n += 1) {
    const item = usable[n % usable.length]
    if (!item) continue
    const fraction = Math.min(
      0.9,
      Math.max(0.1, (fractions[n % fractions.length] ?? 0.5) + idJitter(item.road.id) * 0.16 - 0.08),
    )
    const spot = pointAlong(item.road.points, fraction)
    if (spots.some((placed) => Math.hypot(placed.x - spot.x, placed.z - spot.z) < 1.4)) continue
    const name = item.road.name?.trim()
    spots.push({
      issue: {
        id: `pothole-${item.road.id}-${n}`,
        label: name ? `Illustrative pothole on ${name}` : 'Illustrative pothole',
      },
      x: spot.x,
      z: spot.z,
    })
  }
  if (spots.length === 0) {
    const item = usable[0]
    if (!item) return []
    const spot = pointAlong(item.road.points, 0.5)
    const name = item.road.name?.trim()
    spots.push({
      issue: {
        id: `pothole-${item.road.id}-0`,
        label: name ? `Illustrative pothole on ${name}` : 'Illustrative pothole',
      },
      x: spot.x,
      z: spot.z,
    })
  }
  return spots
}

export const PATCH_DESCRIPTION =
  'Fill and compact this illustrative pothole so the lane is even.'

/** Fold the clicked pothole into a generated draft. The route text stays as generated. */
export function draftForPothole(
  draft: DraftProposal,
  hole: PotholeIssue | null,
  patched: boolean,
): DraftProposal {
  if (!hole) return draft
  const status = patched ? 'Patched in this demo.' : 'Not patched yet.'
  return {
    ...draft,
    headline: `Review a patch for ${hole.label}`,
    plainLanguageSummary: `${hole.label}. ${status} ${PATCH_DESCRIPTION} This street pothole is illustrative, not a surveyed defect, and it does not change the modeled route. ${draft.plainLanguageSummary}`,
    requestForReview: `${status} ${PATCH_DESCRIPTION} ${draft.requestForReview}`,
    meetingTalkingPoints: [
      `${hole.label}. ${status}`,
      PATCH_DESCRIPTION,
      ...draft.meetingTalkingPoints,
    ],
    limitations: `${draft.limitations} The street pothole is illustrative and is not part of the modeled route distance.`,
  }
}

type PotholeState = {
  selectedId: string | null
  patchedIds: readonly string[]
}

let catalog: readonly PotholeIssue[] = POTHOLES
let state: PotholeState = { selectedId: null, patchedIds: [] }
const listeners = new Set<() => void>()

function known(id: string) {
  return catalog.some((hole) => hole.id === id)
}

/** The holes for the city on screen. Unknown ids from the previous city are dropped. */
export function adoptPotholes(next: readonly PotholeIssue[]) {
  catalog = next
  if (state.selectedId && !known(state.selectedId)) {
    state = { ...state, selectedId: null }
    emit()
  }
}

function emit() {
  for (const listener of listeners) listener()
}

export function getPotholeFix(): PotholeState {
  return state
}

export function potholeById(id: string | null): PotholeIssue | null {
  if (!id) return null
  return catalog.find((hole) => hole.id === id) ?? null
}

export function selectPothole(id: string) {
  if (!known(id)) return
  state = { ...state, selectedId: id }
  emit()
}

export function clearPothole() {
  if (state.selectedId === null) return
  state = { ...state, selectedId: null }
  emit()
}

export function patchPothole(id: string) {
  if (!known(id)) return
  const patchedIds = state.patchedIds.includes(id)
    ? state.patchedIds
    : [...state.patchedIds, id]
  state = { selectedId: id, patchedIds }
  emit()
}

export function resetPotholeFix() {
  catalog = POTHOLES
  state = { selectedId: null, patchedIds: [] }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePotholeFix(): PotholeState {
  return useSyncExternalStore(subscribe, getPotholeFix, getPotholeFix)
}
