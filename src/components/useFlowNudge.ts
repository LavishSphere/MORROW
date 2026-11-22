import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePotholeFix } from '../city/potholeFix'
import { useStreetImprovements } from '../city/streetImprovements'
import { useIssueState } from '../showcase/issueStore'
import type { AppMode } from '../types'
import {
  NUDGE_STEPS,
  nudgeDelay,
  nudgeFor,
  readDismissed,
  writeDismissed,
  type NudgeStep,
} from './nextStep'

/** sessionStorage, or null where the browser blocks it. */
function session(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

// Dismissed nudges live here for the session, and in sessionStorage when allowed.
let dismissed: ReadonlySet<AppMode> | null = null
const listeners = new Set<() => void>()

function getDismissed(): ReadonlySet<AppMode> {
  dismissed ??= readDismissed(session())
  return dismissed
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function dismissNudge(mode: AppMode) {
  const current = getDismissed()
  if (current.has(mode)) return
  dismissed = new Set([...current, mode])
  writeDismissed(session(), dismissed)
  for (const listener of listeners) listener()
}

/**
 * Which "next step" nudge to show, if any. It appears a little while into
 * a mode, or soon after the resident does something there, and stays
 * closed once dismissed or once they reach the next mode on their own.
 */
export function useFlowNudge(mode: AppMode): { step: NudgeStep | null; dismiss: () => void } {
  const closed = useSyncExternalStore(subscribe, getDismissed, getDismissed)
  const { selectedId, fixed } = useIssueState()
  const { patchedIds } = usePotholeFix()
  const { selectedIds } = useStreetImprovements()
  const fixes = fixed.size + patchedIds.length + selectedIds.length
  const delay = nudgeDelay(mode, { selected: selectedId !== null, fixes })
  const [ready, setReady] = useState<AppMode | null>(null)

  // Reaching a mode means the nudge pointing at it is no longer needed.
  useEffect(() => {
    for (const step of NUDGE_STEPS) if (step.to === mode) dismissNudge(step.from)
  }, [mode])

  const wanted = nudgeFor(mode) !== null && !closed.has(mode)
  useEffect(() => {
    if (!wanted || delay === null) return
    const timer = window.setTimeout(() => setReady(mode), delay)
    return () => window.clearTimeout(timer)
  }, [mode, wanted, delay])

  const step = wanted && ready === mode ? nudgeFor(mode) : null
  return { step, dismiss: () => dismissNudge(mode) }
}
