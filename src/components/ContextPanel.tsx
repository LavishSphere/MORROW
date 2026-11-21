import { EvidenceBadge } from './EvidenceBadge'
import type { AppMode, Barrier, Intervention } from '../types'

type Props = {
  mode: AppMode
  barriers: Barrier[]
  selectedBarrier: Barrier | null
  interventions: Intervention[]
  selectedIntervention: Intervention | null
  dataNote: string
  onSelectBarrier: (id: string) => void
  onSelectIntervention: (id: string) => void
}

function barrierTypeLabel(type: Barrier['type']): string {
  switch (type) {
    case 'missing_ramp':
      return 'Missing curb ramp'
    case 'unsafe_crossing':
      return 'Unsafe crossing'
    case 'blocked_path':
      return 'Blocked path'
  }
}

export function ContextPanel({
  mode,
  barriers,
  selectedBarrier,
  interventions,
  selectedIntervention,
  dataNote,
  onSelectBarrier,
  onSelectIntervention,
}: Props) {
  return (
    <aside
      id="context-panel"
      className="context-panel"
      role="tabpanel"
      aria-labelledby={`mode-tab-${mode}`}
    >
      <header className="context-panel__header">
        <h2 className="context-panel__title">
          {mode === 'explore' && 'Barriers'}
          {mode === 'improve' && 'Options'}
          {mode === 'compare' && 'Outcomes'}
          {mode === 'propose' && 'Proposal'}
        </h2>
        <p className="context-panel__data-note">{dataNote}</p>
      </header>

      {mode === 'explore' && (
        <div className="context-panel__body">
          <p className="context-panel__lead">
            Nearby issues from the bundled Wellesley set. Status badges stay
            honest — this showcase uses illustrative records.
          </p>
          {barriers.length === 0 ? (
            <p className="empty-state">No barriers in this area yet.</p>
          ) : (
            <ul className="barrier-list">
              {barriers.map((b) => {
                const active = selectedBarrier?.id === b.id
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={`barrier-list__item${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => onSelectBarrier(b.id)}
                    >
                      <span className="barrier-list__row">
                        <span className="barrier-list__name">
                          {b.locationLabel}
                        </span>
                        <EvidenceBadge status={b.evidenceStatus} />
                      </span>
                      <span className="barrier-list__meta">
                        {barrierTypeLabel(b.type)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {selectedBarrier && (
            <div className="detail-block">
              <h3>Evidence</h3>
              <p>{selectedBarrier.description}</p>
              {selectedBarrier.sourceTitle ? (
                <p>
                  Source:{' '}
                  {selectedBarrier.sourceUrl ? (
                    <a
                      href={selectedBarrier.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selectedBarrier.sourceTitle}
                    </a>
                  ) : (
                    selectedBarrier.sourceTitle
                  )}
                </p>
              ) : (
                <p className="muted">
                  No external source — illustrative scenario.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'improve' && (
        <div className="context-panel__body">
          {!selectedBarrier ? (
            <p className="empty-state">
              Select a barrier in Explore first, then choose a change.
            </p>
          ) : (
            <>
              <p className="context-panel__lead">
                Interventions for{' '}
                <strong>{selectedBarrier.locationLabel}</strong>
              </p>
              {interventions.length === 0 ? (
                <p className="empty-state">
                  No interventions for this barrier yet.
                </p>
              ) : (
                <ul className="option-list">
                  {interventions.map((opt) => {
                    const active = selectedIntervention?.id === opt.id
                    return (
                      <li key={opt.id}>
                        <button
                          type="button"
                          className={`option-list__item${active ? ' is-active' : ''}`}
                          aria-pressed={active}
                          onClick={() => onSelectIntervention(opt.id)}
                        >
                          <span className="option-list__name">
                            {opt.description}
                          </span>
                          <span className="option-list__meta">{opt.type}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {mode === 'compare' && (
        <div className="context-panel__body">
          <p className="empty-state">
            Before/after routing lands in the Compare PR (
            <code>compareIntervention</code>).
          </p>
        </div>
      )}

      {mode === 'propose' && (
        <div className="context-panel__body">
          <p className="empty-state">
            Editable draft and Export PDF land in the Propose PR.
          </p>
        </div>
      )}
    </aside>
  )
}
