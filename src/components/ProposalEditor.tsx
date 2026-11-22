import { formatMeters } from '../satellite/stats/format'
import { EvidenceBadge } from './EvidenceBadge'
import { useState } from 'react'
import { ProposalIssueFacts, ProposalIssueTable } from './ProposalIssues'
import { defaultRecipientFor, localDay, proposalFileName, townName } from './proposalLetter'
import type { DraftProposal, ProposalFacts } from '../types'

type Props = {
  facts: ProposalFacts
  draft: DraftProposal
  warnings: string[]
  aiGenerated: boolean
  /** The Gemini model that wrote the draft, when the live API says. */
  draftModel?: string | null
  geminiAvailable: boolean
  apiAvailable: boolean
  onChange: (draft: DraftProposal) => void
  /** Prints the letter; the name becomes the PDF's suggested file name. */
  onExportPdf: (fileName: string) => void
}

export function ProposalEditor({
  facts,
  draft,
  warnings,
  aiGenerated,
  draftModel,
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

  // Issues only: the resident's map issues, no showcase route or trip.
  const issuesOnly = facts.scope === 'issues'

  // Who it goes to and who signs it: typed by the resident, never sent anywhere.
  const town = townName(facts.city)
  const defaultRecipient = defaultRecipientFor(facts.city)
  const [recipient, setRecipient] = useState('')
  const [sender, setSender] = useState('')
  const [contact, setContact] = useState('')
  // The letter's date, fixed when the draft opens.
  const [issued] = useState(() => new Date())
  const today = issued.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const reference = `MRW-${localDay(issued).replaceAll('-', '')}-${(facts.issues?.length ?? 1)
    .toString()
    .padStart(2, '0')}`
  const sources = [...new Set(facts.evidenceSources.map((source) => source.title))]
  // Gemini's limitations often restate the assumptions; print them once.
  const assumptions = facts.modelAssumptions.filter((a) => !draft.limitations.includes(a))

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
          {aiGenerated ? `AI draft${draftModel ? ` · ${modelLabel(draftModel)}` : ''}` : 'Template draft'}
        </span>
      </div>

      <article id="proposal-print" className="proposal-print">
        <header className="proposal-print__banner">
          <div>
            <p className="proposal-print__brand">MORROW</p>
            <p className="proposal-print__sub">Community accessibility proposal</p>
          </div>
          <dl className="proposal-print__meta">
            <div>
              <dt>Date</dt>
              <dd>{today}</dd>
            </div>
            <div>
              <dt>Municipality</dt>
              <dd>{facts.city}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{reference}</dd>
            </div>
          </dl>
        </header>

        <dl className="proposal-print__memo">
          <div>
            <dt>To</dt>
            <dd>{recipient.trim() || defaultRecipient}</dd>
          </div>
          <div>
            <dt>From</dt>
            <dd>{sender.trim() || `Residents of ${town}`}</dd>
          </div>
          <div>
            <dt>Re</dt>
            <dd>
              <strong>{draft.headline || 'Community accessibility proposal'}</strong>
            </dd>
          </div>
        </dl>

        <section>
          <h3>1. Summary</h3>
          <p>{draft.plainLanguageSummary}</p>
          {!issuesOnly && (
            <p>
              Location: {facts.locationLabel}. Trip: {facts.originLabel} → {facts.destinationLabel}. Barrier type:{' '}
              <strong>{facts.barrierType.replaceAll('_', ' ')}</strong>.
            </p>
          )}
        </section>

        {issuesOnly ? (
          <ProposalIssueTable issues={facts.issues ?? []} title="2. Locations and proposed improvements" />
        ) : (
          <section>
            <h3>2. Proposed improvement and modeled outcome</h3>
            <p>{facts.intervention}</p>
            <dl className="propose-brief__meters">
              <div>
                <dt>Accessible route today</dt>
                <dd>{formatMeters(facts.beforeMeters)}</dd>
              </div>
              <div>
                <dt>With the improvement</dt>
                <dd>{formatMeters(facts.afterMeters)}</dd>
              </div>
            </dl>
            {facts.newlyReachableDestinations != null && (
              <p>Newly reachable destinations: {facts.newlyReachableDestinations}</p>
            )}
          </section>
        )}

        {!issuesOnly && <ProposalIssueFacts issues={facts.issues ?? []} />}

        <section>
          <h3>3. Requested action</h3>
          <p>{draft.requestForReview}</p>
          {draft.meetingTalkingPoints.some((p) => p.trim()) && (
            <>
              <p className="proposal-print__label">Points for discussion</p>
              <ol>
                {draft.meetingTalkingPoints
                  .filter((p) => p.trim())
                  .map((p) => (
                    <li key={p}>{p}</li>
                  ))}
              </ol>
            </>
          )}
        </section>

        <section>
          <h3>4. Evidence and method</h3>
          <p>
            Evidence status: <EvidenceBadge status={facts.evidenceStatus} />
            {sources.length > 0 && <> Sources: {sources.join('; ')}.</>}
          </p>
          {assumptions.length > 0 && (
            <ul>
              {assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <p className="proposal-print__limitations">{draft.limitations}</p>
        </section>

        <section className="proposal-print__sign">
          <p>Respectfully submitted,</p>
          <div className="proposal-print__sign-grid">
            <p>
              <span className="proposal-print__line" />
              Signature
            </p>
            <p>
              <span className="proposal-print__line">{sender.trim()}</span>
              Name
            </p>
            <p>
              <span className="proposal-print__line">{contact.trim()}</span>
              Address, email, or phone
            </p>
            <p>
              <span className="proposal-print__line">{today}</span>
              Date
            </p>
          </div>
        </section>

        <footer className="proposal-print__footer">
          Prepared with MORROW from OpenStreetMap data (© OpenStreetMap contributors). Reference {reference}.
        </footer>
      </article>

      <div className="proposal-editor__actions">
        <button type="button" className="btn-primary" onClick={() => onExportPdf(proposalFileName(facts.city, issued))}>
          Export PDF
        </button>
        <p className="muted">
          Opens the print dialog — choose “Save as PDF”. Saves as “{proposalFileName(facts.city, issued)}.pdf”. Add your
          name under “Edit the draft” to sign it.
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
          Addressed to
          <input
            type="text"
            value={recipient}
            placeholder={defaultRecipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </label>
        <label>
          Your name (signs the letter)
          <input
            type="text"
            value={sender}
            placeholder={`Residents of ${town}`}
            autoComplete="name"
            onChange={(e) => setSender(e.target.value)}
          />
        </label>
        <label>
          Your address, email, or phone (optional)
          <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} />
        </label>
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

/** "gemini-3.8-flash" → "Gemini 3.8 Flash". */
function modelLabel(id: string): string {
  return id
    .split('-')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ')
}
