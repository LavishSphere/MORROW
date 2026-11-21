import { useSyncExternalStore } from 'react'
import type { DraftProposal } from '../types.ts'

export type PotholeIssue = {
  id: string
  label: string
}

/** Decorative boulevard holes in the glass city. Not a field survey. */
export const POTHOLES: readonly PotholeIssue[] = [
  { id: 'boulevard-pothole-1', label: 'Boulevard pothole, west of the bend' },
  { id: 'boulevard-pothole-2', label: 'Boulevard pothole, at the bend' },
  { id: 'boulevard-pothole-3', label: 'Boulevard pothole, east of the bend' },
]

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
    plainLanguageSummary: `${hole.label}. ${status} ${PATCH_DESCRIPTION} This boulevard pothole is illustrative, not a surveyed defect, and it does not change the modeled route. ${draft.plainLanguageSummary}`,
    requestForReview: `${status} ${PATCH_DESCRIPTION} ${draft.requestForReview}`,
    meetingTalkingPoints: [
      `${hole.label}. ${status}`,
      PATCH_DESCRIPTION,
      ...draft.meetingTalkingPoints,
    ],
    limitations: `${draft.limitations} The boulevard pothole is illustrative and is not part of the modeled route distance.`,
  }
}

type PotholeState = {
  selectedId: string | null
  patchedIds: readonly string[]
}

let state: PotholeState = { selectedId: null, patchedIds: [] }
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function getPotholeFix(): PotholeState {
  return state
}

export function potholeById(id: string | null): PotholeIssue | null {
  if (!id) return null
  return POTHOLES.find((hole) => hole.id === id) ?? null
}

export function selectPothole(id: string) {
  if (!POTHOLES.some((hole) => hole.id === id)) return
  state = { ...state, selectedId: id }
  emit()
}

export function clearPothole() {
  if (state.selectedId === null) return
  state = { ...state, selectedId: null }
  emit()
}

export function patchPothole(id: string) {
  if (!POTHOLES.some((hole) => hole.id === id)) return
  const patchedIds = state.patchedIds.includes(id)
    ? state.patchedIds
    : [...state.patchedIds, id]
  state = { selectedId: id, patchedIds }
  emit()
}

export function resetPotholeFix() {
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
