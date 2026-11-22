import { useMemo, useState } from 'react'
import { ISSUE_KIND_LABEL, type IssueKind } from '../../shared/issues.ts'
import { flyTo, useCityState } from '../showcase/cityStore'
import {
  measureFor,
  selectIssue,
  toggleChosen,
  toggleFixed,
  useIssueState,
  type SceneIssue,
} from '../showcase/issueStore'
import { ISSUE_COLOR } from '../showcase/scene/IssueLayer'

const KINDS = Object.keys(ISSUE_KIND_LABEL) as IssueKind[]
/** How many nearby issues to list. */
const LIST_SIZE = 12

/**
 * Improve: browse the accessibility issues found in the map, nearest first,
 * then improve one and watch the fix appear in the city.
 */
export function IssueBrowser() {
  const { issues, fixed, chosen, selectedId } = useIssueState()
  const { pose } = useCityState()
  const [kind, setKind] = useState<IssueKind | 'all'>('all')

  const counts = useMemo(() => {
    const out: Partial<Record<IssueKind, number>> = {}
    for (const issue of issues) out[issue.kind] = (out[issue.kind] ?? 0) + 1
    return out
  }, [issues])

  const selected = issues.find((issue) => issue.id === selectedId) ?? null
  const nearby = issues
    .filter((issue) => kind === 'all' || issue.kind === kind)
    .map((issue) => ({ issue, d: Math.hypot(issue.x - pose.x, issue.z - pose.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, LIST_SIZE)
    .map((entry) => entry.issue)

  const open = (issue: SceneIssue) => {
    selectIssue(issue.id)
    flyTo(issue.x, issue.z)
  }

  if (issues.length === 0) {
    return <p className="mode-page__lead">Looking for accessibility issues in this map…</p>
  }

  return (
    <div className="issue-browser">
      <p className="mode-page__lead">
        <strong>{issues.length} issues</strong> found in OpenStreetMap. {fixed.size} improved.
      </p>

      <div className="issue-filters" role="group" aria-label="Filter issues">
        <button
          type="button"
          className={`issue-chip${kind === 'all' ? ' is-active' : ''}`}
          aria-pressed={kind === 'all'}
          onClick={() => setKind('all')}
        >
          All
        </button>
        {KINDS.filter((k) => counts[k]).map((k) => (
          <button
            key={k}
            type="button"
            className={`issue-chip${kind === k ? ' is-active' : ''}`}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            <span className="issue-dot" style={{ background: ISSUE_COLOR[k] }} />
            {ISSUE_KIND_LABEL[k]} {counts[k]}
          </button>
        ))}
      </div>

      {selected && (
        <IssueDetail issue={selected} fixed={fixed.has(selected.id)} chosen={chosen.has(selected.id)} />
      )}

      <p className="issue-list__head">Nearest to your view</p>
      <ul className="issue-list">
        {nearby.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              className={`issue-row${issue.id === selectedId ? ' is-active' : ''}`}
              onClick={() => open(issue)}
            >
              <span
                className="issue-dot"
                style={{ background: fixed.has(issue.id) ? '#2ecc71' : ISSUE_COLOR[issue.kind] }}
              />
              <span className="issue-row__text">
                <span className="issue-row__title">{issue.title}</span>
                <span className="issue-row__where">{issue.where}</span>
              </span>
              {fixed.has(issue.id) && <span className="issue-row__done">Improved</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function IssueDetail({ issue, fixed, chosen }: { issue: SceneIssue; fixed: boolean; chosen: boolean }) {
  const measure = measureFor(issue)
  return (
    <article className={`issue-card${fixed ? ' is-fixed' : ''}`} aria-live="polite">
      <p className="issue-card__kind">
        <span className="issue-dot" style={{ background: fixed ? '#2ecc71' : ISSUE_COLOR[issue.kind] }} />
        {ISSUE_KIND_LABEL[issue.kind]} · {issue.where}
      </p>
      <h3 className="issue-card__title">{issue.title}</h3>
      <p className="issue-card__text">{fixed ? measure.after : measure.before}</p>
      {!fixed && <p className="issue-card__fix">Fix: {issue.fix}</p>}
      {fixed && measure.metrics.length > 0 && (
        <dl className="issue-card__metrics">
          {measure.metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="issue-card__actions">
        <button type="button" className="issue-card__improve" onClick={() => toggleFixed(issue.id)}>
          {fixed ? 'Undo' : 'Improve'}
        </button>
        <label className="issue-card__add">
          <input type="checkbox" checked={chosen} onChange={() => toggleChosen(issue.id)} />
          Add to proposal
        </label>
      </div>
      <p className="issue-card__source">
        Community-reported ·{' '}
        <a href={issue.sourceUrl} target="_blank" rel="noreferrer">
          {issue.source}
        </a>
        . Not a field survey.
        {measure.modeled ? ' Distances are modeled.' : ''}
      </p>
    </article>
  )
}
