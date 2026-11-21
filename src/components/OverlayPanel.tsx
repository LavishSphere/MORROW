import type { ReactNode } from 'react'

type Props = {
  open: boolean
  /** Changes when the content switches, so the new page eases in. */
  contentKey: string | null
  children: ReactNode
}

/**
 * The one place mode pages appear: a card on the left, between the top bar
 * and the mode bar. It slides in and out; switching pages cross-fades.
 * The last page stays mounted while the card slides away.
 */
export function OverlayPanel({ open, contentKey, children }: Props) {
  return (
    <aside
      className={`overlay-panel${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div key={contentKey ?? 'empty'} className="overlay-panel__body">
        {children}
      </div>
    </aside>
  )
}
