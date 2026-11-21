import { EvidenceBadge } from './EvidenceBadge'
import { ProposalEditor } from './ProposalEditor'
import type { CompareResult } from '../data/api'
import type {
  AppMode,
  Barrier,
  DraftProposal,
  Intervention,
  ProposalFacts,
  Scenario,
} from '../types'

type Props = {
  mode: AppMode
  barriers: Barrier[]
  selectedBarrier: Barrier | null
  interventions: Intervention[]
  selectedIntervention: Intervention | null
  scenario: Scenario
  dataNote: string
  compare: CompareResult | null
  proposalFacts: ProposalFacts | null
  proposalDraft: DraftProposal | null
  proposalWarnings: string[]
  aiGenerated: boolean
  geminiAvailable: boolean
  apiAvailable: boolean
  proposalLoading: boolean
  onSelectBarrier: (id: string) => void
  onSelectIntervention: (id: string) => void
  onDraftChange: (draft: DraftProposal) => void
  onGenerate: () => void
  onExportPdf: () => void
}

function formatDelta(delta: number | null): string {
  if (delta == null) return 'n/a'
  if (delta === 0) return '0 m'
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta)} m`
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
  compare,
  proposalFacts,
  proposalDraft,
  proposalWarnings,
  aiGenerated,
  geminiAvailable,
  apiAvailable,
  proposalLoading,
  onSelectBarrier,
  onSelectIntervention,
  onDraftChange,
  onGenerate,
  onExportPdf,
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
            Modeled before / after via{' '}
            <code>@morrow/routing.compareScenario</code> for scenario{' '}
            <code>{scenario.id}</code>
            {selectedIntervention
              ? ` · intervention ${selectedIntervention.id}`
              : ''}
            . From Sophia&apos;s{' '}
            <code>@morrow/routing.compareScenario</code>
            {compare
              ? ` · source: ${compare.source}${compare.routingPackageAvailable ? '' : ' (unavailable — mock)'}`
              : ''}
            .
          </p>
          {compare ? (
            <>
              <dl className="metrics">
                <div>
                  <dt>Trip</dt>
                  <dd>
                    {scenario.originLabel} → {scenario.destinationLabel}
                  </dd>
                </div>
                <div>
                  <dt>Before</dt>
                  <dd>
                    {compare.beforeMeters == null
                      ? 'unreachable'
                      : `${compare.beforeMeters} m`}
                    <span className="metrics__sub">
                      edges: {compare.before.edgeIds.join(', ') || '—'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>
                    {compare.afterMeters == null
                      ? 'unreachable'
                      : `${compare.afterMeters} m`}
                    <span className="metrics__sub">
                      edges: {compare.after.edgeIds.join(', ') || '—'} · geometry{' '}
                      {compare.after.geometry.length} pts
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Delta</dt>
                  <dd>
                    {formatDelta(compare.deltaMeters)} (after − before)
                    {compare.becameReachable ? ' · became reachable' : ''}
                  </dd>
                </div>
              </dl>
              <div className="detail-block">
                <h3>Assumptions</h3>
                <ul>
                  {compare.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="muted">Select an intervention in Improve first.</p>
          )}
        </div>
      )}

      {mode === 'propose' && (
        <div className="context-panel__body">
          <p className="context-panel__lead">
            Editable advocacy draft. Client sends ids only to the generate stub;
            metrics and evidence badges render from the returned facts object.
          </p>
          <div className="proposal-editor__actions" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={onGenerate}
              disabled={
                proposalLoading ||
                !selectedBarrier ||
                !selectedIntervention
              }
            >
              {proposalLoading ? 'Generating…' : 'Generate proposal'}
            </button>
          </div>
          {proposalFacts && proposalDraft ? (
            <ProposalEditor
              facts={proposalFacts}
              draft={proposalDraft}
              warnings={proposalWarnings}
              aiGenerated={aiGenerated}
              geminiAvailable={geminiAvailable}
              apiAvailable={apiAvailable}
              onChange={onDraftChange}
              onExportPdf={onExportPdf}
            />
          ) : (
            <p className="muted">
              Choose a barrier and intervention, then generate a template draft
              (Gemini path labeled unavailable).
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
