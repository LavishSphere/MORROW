import type { AppMode } from '../types.ts'

/**
 * The small "what next" nudge: Explore → Improve → Compare → Propose.
 * Pure rules here, so they can be tested without a browser.
 */

export type NudgeStep = {
  /** The mode the nudge shows in. */
  from: AppMode
  /** The mode its button opens. */
  to: AppMode
  label: string
  text: string
}

export const NUDGE_STEPS: readonly NudgeStep[] = [
  { from: 'explore', to: 'improve', label: 'Improve', text: 'Pick a barrier and choose a fix for it.' },
  { from: 'improve', to: 'compare', label: 'Compare', text: 'See the street today next to your fixes.' },
  { from: 'compare', to: 'propose', label: 'Propose', text: 'Turn your fixes into a letter to the town.' },
]

/** The nudge for a mode. Propose is the last step, so it has none. */
export function nudgeFor(mode: AppMode): NudgeStep | null {
  return NUDGE_STEPS.find((step) => step.from === mode) ?? null
}

/** What the resident has done so far, for deciding when to nudge. */
export type NudgeProgress = {
  /** An issue is selected in the city. */
  selected: boolean
  /** Fixes applied in Improve: issues, potholes, street improvements. */
  fixes: number
}

/** Explore nudges after a look around; Compare after a moment to read. */
export const EXPLORE_DELAY_MS = 8000
export const COMPARE_DELAY_MS = 6000
/** After something meaningful, the nudge follows quickly. */
export const AFTER_ACTION_MS = 1500

/**
 * How long to wait before nudging in this mode, or null for not yet.
 * Improve waits for a fix: Compare has nothing to show without one.
 */
export function nudgeDelay(mode: AppMode, progress: NudgeProgress): number | null {
  if (mode === 'explore') return progress.selected ? AFTER_ACTION_MS : EXPLORE_DELAY_MS
  if (mode === 'improve') return progress.fixes > 0 ? AFTER_ACTION_MS : null
  if (mode === 'compare') return COMPARE_DELAY_MS
  return null
}

export const DISMISSED_KEY = 'morrow:flow-nudge-dismissed'

type SessionLike = Pick<Storage, 'getItem' | 'setItem'>

const MODES: readonly AppMode[] = ['explore', 'improve', 'compare', 'propose']

/** Dismissed nudges for this session. Blocked storage reads as none. */
export function readDismissed(storage: SessionLike | null | undefined): Set<AppMode> {
  try {
    const raw = storage?.getItem(DISMISSED_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return new Set()
    return new Set(MODES.filter((mode) => list.includes(mode)))
  } catch {
    return new Set()
  }
}

/** Save dismissed nudges. Fails quietly; memory still holds them. */
export function writeDismissed(storage: SessionLike | null | undefined, dismissed: ReadonlySet<AppMode>) {
  try {
    storage?.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]))
  } catch {
    // Private windows and blocked storage: the nudge stays closed until reload.
  }
}
