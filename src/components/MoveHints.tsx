import { useState } from 'react'

/** Touch screens get touch gestures; everything else gets mouse + keys. */
function isTouch() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * How to move around the 3D city. Sits bottom-left, in the same band as
 * the other overlays, and collapses to a small "Controls" pill.
 */
export function MoveHints() {
  const [open, setOpen] = useState(true)
  const touch = isTouch()

  if (!open) {
    return (
      <button
        type="button"
        className="move-hints move-hints--pill"
        aria-expanded={false}
        onClick={() => setOpen(true)}
      >
        Controls
      </button>
    )
  }

  return (
    <section className="move-hints" aria-label="How to move around the city">
      <div className="move-hints__head">
        <p className="move-hints__title">Move around</p>
        <button
          type="button"
          className="move-hints__close"
          aria-label="Hide controls"
          aria-expanded
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>
      {touch ? (
        <ul className="move-hints__list">
          <li><span className="move-hints__keys">Drag</span> Rotate</li>
          <li><span className="move-hints__keys">Two fingers</span> Move</li>
          <li><span className="move-hints__keys">Pinch</span> Zoom</li>
        </ul>
      ) : (
        <ul className="move-hints__list">
          <li>
            <span className="move-hints__keys">
              <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
            </span>
            Move <span className="move-hints__or">or right-drag</span>
          </li>
          <li>
            <span className="move-hints__keys"><kbd>Drag</kbd></span>
            Rotate <span className="move-hints__or">or</span> <kbd>Q</kbd><kbd>E</kbd>
          </li>
          <li>
            <span className="move-hints__keys"><kbd>Scroll</kbd></span>
            Zoom <span className="move-hints__or">or</span> <kbd>+</kbd><kbd>−</kbd>
          </li>
          <li>
            <span className="move-hints__keys"><kbd>Shift</kbd></span>
            Faster
          </li>
        </ul>
      )}
    </section>
  )
}
