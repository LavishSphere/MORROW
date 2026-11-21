import type { AppMode } from '../types'

const COPY: Record<AppMode, { title: string; body: string }> = {
  explore: {
    title: 'Explore',
    body: 'Barrier list and evidence arrive in the next UI PR.',
  },
  improve: {
    title: 'Improve',
    body: 'Intervention options arrive in the next UI PR.',
  },
  compare: {
    title: 'Compare',
    body: 'Before/after routing arrives in a later UI PR.',
  },
  propose: {
    title: 'Propose',
    body: 'Editable draft and PDF export arrive in a later UI PR.',
  },
}

type Props = { mode: AppMode; dataNote: string }

export function ShellPanel({ mode, dataNote }: Props) {
  const copy = COPY[mode]
  return (
    <aside
      id="context-panel"
      className="context-panel"
      role="tabpanel"
      aria-labelledby={`mode-tab-${mode}`}
    >
      <header className="context-panel__header">
        <h2 className="context-panel__title">{copy.title}</h2>
        <p className="context-panel__data-note">{dataNote}</p>
      </header>
      <div className="context-panel__body">
        <p className="empty-state">{copy.body}</p>
      </div>
    </aside>
  )
}
