import { EvidenceBadge } from './EvidenceBadge'
import type { AppMode, Barrier, Intervention, Scenario } from '../types'

type Props = {
  mode: AppMode
  barriers: Barrier[]
  selectedBarrier: Barrier | null
  interventions: Intervention[]
  selectedIntervention: Intervention | null
  scenario: Scenario
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
  scenario,
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
                <p className="muted">No external source — illustrative scenario.</p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'improve' && (
        <div className="context-panel__body">
          {!selectedBarrier ? (
            <p className="context-panel__lead">
              Select a barrier in Explore first, then choose a change.
            </p>
          ) : (
            <>
              <p className="context-panel__lead">
                Interventions for{' '}
                <strong>{selectedBarrier.locationLabel}</strong>
              </p>
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
              {interventions.length === 0 && (
                <p className="muted">No interventions for this barrier yet.</p>
              )}
            </>
          )}
        </div>
      )}

      {mode === 'compare' && (
        <div className="context-panel__body">
          <p className="context-panel__lead">
            Modeled before / after for scenario{' '}
            <code>{scenario.id}</code>. Figures are fixture placeholders until
            the routing engine ships.
          </p>
          <dl className="metrics">
            <div>
              <dt>Trip</dt>
              <dd>
                {scenario.originLabel} → {scenario.destinationLabel}
              </dd>
            </div>
            <div>
              <dt>Before</dt>
              <dd>{scenario.modeledBeforeMeters} m</dd>
            </div>
            <div>
              <dt>After</dt>
              <dd>{scenario.modeledAfterMeters} m</dd>
            </div>
            <div>
              <dt>Change</dt>
              <dd>
                −{scenario.modeledBeforeMeters - scenario.modeledAfterMeters} m
                (modeled)
              </dd>
            </div>
          </dl>
          <div className="detail-block">
            <h3>Assumptions</h3>
            <ul>
              {scenario.modelAssumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {mode === 'propose' && (
        <div className="context-panel__body">
          <p className="context-panel__lead">
            Proposal shell — Phase 1 shows structure only. Gemini drafting and
            PDF export arrive in later phases via Ashsmith&apos;s generate API.
          </p>
          <article className="proposal-shell">
            <h3>Location</h3>
            <p>
              {scenario.city} — {selectedBarrier?.locationLabel ?? scenario.label}
            </p>
            <h3>Issue</h3>
            <p>
              {selectedBarrier?.description ??
                'Select a barrier to fill this section.'}
            </p>
            <h3>Evidence</h3>
            {selectedBarrier ? (
              <p>
                <EvidenceBadge status={selectedBarrier.evidenceStatus} />{' '}
                Simulation / demo dataset.
              </p>
            ) : (
              <p className="muted">No barrier selected.</p>
            )}
            <h3>Suggested intervention</h3>
            <p>
              {selectedIntervention?.description ??
                'Choose an option in Improve.'}
            </p>
            <h3>Modeled outcome</h3>
            <p>
              Accessible route {scenario.modeledBeforeMeters} m →{' '}
              {scenario.modeledAfterMeters} m (fixture).
            </p>
            <h3>Action requested</h3>
            <p>
              Ask qualified local officials to review feasibility on site before
              any infrastructure decision.
            </p>
            <h3>Next steps</h3>
            <p className="muted">
              Export PDF and editable draft — not wired in Phase 1.
            </p>
          </article>
        </div>
      )}
    </aside>
  )
}
