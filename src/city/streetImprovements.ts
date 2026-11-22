import { useSyncExternalStore } from 'react'
import type { DraftProposal } from '../types.ts'

export type StreetImprovement = {
  id: string
  name: string
  description: string
  category: 'cleanliness' | 'comfort' | 'access' | 'safety'
}

export const STREET_IMPROVEMENTS: readonly StreetImprovement[] = [
  {
    id: 'add-garbage-cans',
    name: 'Add garbage cans',
    description: 'Place litter bins near crossings and rest points.',
    category: 'cleanliness',
  },
  {
    id: 'add-bicycle-racks',
    name: 'Add bicycle racks',
    description: 'Add secure bicycle parking near the library entrance.',
    category: 'access',
  },
  {
    id: 'add-benches',
    name: 'Add accessible benches',
    description: 'Add shaded benches with room for mobility aids nearby.',
    category: 'comfort',
  },
  {
    id: 'add-better-lighting',
    name: 'Improve street lighting',
    description: 'Add or improve lighting at crossings and footways.',
    category: 'safety',
  },
  {
    id: 'add-recycling',
    name: 'Add recycling bins',
    description: 'Pair recycling bins with existing waste stations.',
    category: 'cleanliness',
  },
]

/** Catalog entries for the given ids, in catalog order. Unknown ids are skipped. */
export function improvementsByIds(ids: readonly string[]): StreetImprovement[] {
  return STREET_IMPROVEMENTS.filter((item) => ids.includes(item.id))
}

export const STREET_IMPROVEMENTS_LIMITATION =
  'The selected street improvements are illustrative and do not change the modeled route distance.'

/** Fold the selected street improvements into a generated draft. The route text stays as generated. */
export function draftForStreetImprovements(
  draft: DraftProposal,
  selected: readonly StreetImprovement[],
): DraftProposal {
  if (selected.length === 0) return draft
  const names = selected.map((item) => item.name).join(', ')
  const includes = `Also includes: ${names}.`
  return {
    ...draft,
    plainLanguageSummary: `${draft.plainLanguageSummary} ${includes}`,
    requestForReview: `${draft.requestForReview} Please also review these street improvements: ${names}.`,
    meetingTalkingPoints: [
      ...draft.meetingTalkingPoints,
      ...selected.map((item) => `${item.name}. ${item.description}`),
    ],
    limitations: `${draft.limitations} ${STREET_IMPROVEMENTS_LIMITATION}`,
  }
}

type State = {
  selectedIds: readonly string[]
}

let state: State = { selectedIds: [] }
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function getStreetImprovementState(): State {
  return state
}

export function toggleStreetImprovement(id: string) {
  if (!STREET_IMPROVEMENTS.some((item) => item.id === id)) return
  state = {
    selectedIds: state.selectedIds.includes(id)
      ? state.selectedIds.filter((selectedId) => selectedId !== id)
      : [...state.selectedIds, id],
  }
  emit()
}

export function resetStreetImprovements() {
  state = { selectedIds: [] }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useStreetImprovements(): State {
  return useSyncExternalStore(subscribe, getStreetImprovementState, getStreetImprovementState)
}
