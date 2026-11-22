import { useId } from 'react'
import type { AppMode } from '../types'
import type { NudgeStep } from './nextStep'

/** Keep keyboard focus on the mode bar once the card goes away. */
function focusTab(mode: AppMode) {
  requestAnimationFrame(() => document.getElementById(`mode-tab-${mode}`)?.focus())
}

type Props = {
  step: NudgeStep | null
  onGo: (mode: AppMode) => void
  onClose: () => void
}

/**
 * A small, optional "Next: Improve" card just above the mode bar. The
 * button switches modes the same way the mode bar does; × or Escape
 * closes it for the rest of the session.
 */
export function FlowNudge({ step, onGo, onClose }: Props) {
  const titleId = useId()
  return (
    <>
      {/* Announced politely when it appears; never steals focus. */}
      <p className="sr-only" role="status">
        {step ? `Suggested next step: ${step.label}. ${step.text}` : ''}
      </p>
      {step && (
        <aside
          key={step.from}
          className="flow-nudge"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              onClose()
              focusTab(step.from)
            }
          }}
        >
          <p className="flow-nudge__text">
            <span id={titleId} className="flow-nudge__title">
              Next: {step.label}
            </span>{' '}
            <span className="flow-nudge__hint">{step.text}</span>
          </p>
          <button
            type="button"
            className="flow-nudge__go"
            onClick={() => {
              onClose()
              onGo(step.to)
              focusTab(step.to)
            }}
          >
            Go to {step.label}
          </button>
          <button
            type="button"
            className="flow-nudge__close"
            aria-label={`Close the ${step.label} suggestion`}
            onClick={() => {
              onClose()
              focusTab(step.from)
            }}
          >
            ×
          </button>
        </aside>
      )}
    </>
  )
}
