import { formatMeters } from '../satellite/stats/format'
import { EvidenceBadge } from './EvidenceBadge'
import { ProposalIssueFacts } from './ProposalIssues'
import type { DraftProposal, ProposalFacts } from '../types'

type Props = {
  facts: ProposalFacts
  draft: DraftProposal
  warnings: string[]
  aiGenerated: boolean
  geminiAvailable: boolean
  apiAvailable: boolean
  onChange: (draft: DraftProposal) => void
  onExportPdf: () => void
}

export function ProposalEditor({
  facts,
  draft,
  warnings,
  aiGenerated,
  geminiAvailable,
  apiAvailable,
  onChange,
  onExportPdf,
}: Props) {
  const updatePoint = (index: number, value: string) => {
    const next = [...draft.meetingTalkingPoints]
    next[index] = value
    onChange({ ...draft, meetingTalkingPoints: next })
  }

  const addPoint = () => {
    onChange({
      ...draft,
      meetingTalkingPoints: [...draft.meetingTalkingPoints, ''],
    })
  }

  return (
    <div className="proposal-editor">
      <div className="proposal-editor__status" role="status">
        {!apiAvailable && (
          <span className="status-pill status-pill--warn">
            Generate API unavailable
          </span>
        )}
        {!geminiAvailable && (
          <span className="status-pill status-pill--warn">
            Gemini unavailable — template
          </span>
        )}
        <span className="status-pill">
          {aiGenerated ? 'AI draft' : 'Template draft'}
        </span>
      </div>

      <article id="proposal-print" className="proposal-print">
        <header className="proposal-print__banner">
          <p className="proposal-print__brand">MORROW</p>
          <h2>{draft.headline || 'Community accessibility proposal'}</h2>
          <p className="proposal-print__sub">Make tomorrow possible.</p>
        </header>

        <section>
          <h3>1. Location</h3>
          <p>
            {facts.city} — {facts.locationLabel}
          </p>
          <p>
            Trip: {facts.originLabel} → {facts.destinationLabel}
          </p>
        </section>

        <section>
          <h3>2. Issue</h3>
          <p>
            Barrier type: <strong>{facts.barrierType.replaceAll('_', ' ')}</strong>
          </p>
          <p>{draft.plainLanguageSummary}</p>
        </section>

        <section>
          <h3>3. Evidence</h3>
          <p>
            <EvidenceBadge status={facts.evidenceStatus} />
          </p>
          {facts.evidenceSources.length === 0 ? (
            <p>No external source attached — illustrative / simulation dataset.</p>
          ) : (
            <ul>
              {facts.evidenceSources.map((s) => (
                <li key={s.title}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                  {s.observedAt ? ` (${s.observedAt})` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>4. Suggested intervention</h3>
          <p>{facts.intervention}</p>
        </section>

        <section>
          <h3>5. Modeled outcome</h3>
          <dl className="propose-brief__meters">
            <div>
              <dt>Before</dt>
              <dd>{formatMeters(facts.beforeMeters)}</dd>
            </div>
            <div>
              <dt>After</dt>
              <dd>{formatMeters(facts.afterMeters)}</dd>
            </div>
          </dl>
          <p>
            Accessible route before:{' '}
            <strong>{formatMeters(facts.beforeMeters)}</strong>
            ; after:{' '}
            <strong>{formatMeters(facts.afterMeters)}</strong>.
          </p>
          {facts.newlyReachableDestinations != null && (
            <p>
              Newly reachable destinations: {facts.newlyReachableDestinations}
            </p>
          )}
          <ul>
            {facts.modelAssumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>

        <ProposalIssueFacts issues={facts.issues ?? []} />

        <section>
          <h3>6. Action requested</h3>
          <p>{draft.requestForReview}</p>
          {draft.meetingTalkingPoints.length > 0 && (
            <>
              <p>
                <strong>Talking points</strong>
              </p>
              <ul>
                {draft.meetingTalkingPoints
                  .filter((p) => p.trim())
                  .map((p) => (
                    <li key={p}>{p}</li>
                  ))}
              </ul>
            </>
          )}
        </section>

        <section>
          <h3>7. Next steps</h3>
          <p>{facts.nextSteps}</p>
          <p className="proposal-print__limitations">{draft.limitations}</p>
        </section>
      </article>

      <div className="proposal-editor__actions">
        <button type="button" className="btn-primary" onClick={onExportPdf}>
          Export PDF
        </button>
        <p className="muted">
          Opens the print dialog — choose “Save as PDF”. Official metrics and
          evidence come from the brief above, not the editable prose.
        </p>
      </div>

      {warnings.length > 0 && (
        <ul className="proposal-editor__warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <details className="proposal-editor__edit">
        <summary>Edit the draft</summary>
        <div className="proposal-editor__fields">
        <label>
          Headline
          <input
            type="text"
            value={draft.headline}
            onChange={(e) => onChange({ ...draft, headline: e.target.value })}
          />
        </label>
        <label>
          Resident summary
          <textarea
            rows={4}
            value={draft.plainLanguageSummary}
            onChange={(e) =>
              onChange({ ...draft, plainLanguageSummary: e.target.value })
            }
          />
        </label>
        <label>
          Request for review
          <textarea
            rows={3}
            value={draft.requestForReview}
            onChange={(e) =>
              onChange({ ...draft, requestForReview: e.target.value })
            }
          />
        </label>
        <fieldset>
          <legend>Meeting talking points</legend>
          {draft.meetingTalkingPoints.map((point, i) => (
            <input
              key={i}
              type="text"
              value={point}
              aria-label={`Talking point ${i + 1}`}
              onChange={(e) => updatePoint(i, e.target.value)}
            />
          ))}
          <button type="button" className="btn-ghost" onClick={addPoint}>
            Add talking point
          </button>
        </fieldset>
        <label>
          Limitations
          <textarea
            rows={3}
            value={draft.limitations}
            onChange={(e) =>
              onChange({ ...draft, limitations: e.target.value })
            }
          />
        </label>
        </div>
      </details>
    </div>
  )
}
