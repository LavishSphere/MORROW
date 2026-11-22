import { useMemo, useState } from 'react'
import { ISSUE_KIND_LABEL, type IssueKind } from '../../shared/issues.ts'
import { useCityState } from '../showcase/cityStore'
import {
  measureFor,
  selectIssue,
  setPeek,
  toggleChosen,
  toggleFixed,
  useIssueState,
  type Peek,
  type SceneIssue,
} from '../showcase/issueStore'
import { ISSUE_COLOR, PATCH_LABEL, PROPOSED_COLOR } from '../showcase/issueVisuals'
import { IssueGlyph } from './IssueGlyph'

const KINDS = Object.keys(ISSUE_KIND_LABEL) as IssueKind[]
/** How many nearby issues to list. */
const LIST_SIZE = 12

/**
 * Improve: browse the accessibility issues found in the map, nearest first,
 * then improve one and watch the fix appear in the city.
 */
export function IssueBrowser() {
  const { issues, fixed, chosen, selectedId, peek } = useIssueState()
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
            <IssueGlyph kind={k} />
            {ISSUE_KIND_LABEL[k]} {counts[k]}
          </button>
        ))}
      </div>

      {selected && (
        <IssueDetail
          issue={selected}
          fixed={fixed.has(selected.id)}
          chosen={chosen.has(selected.id)}
          peek={peek}
        />
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
              <IssueGlyph kind={issue.kind} fixed={fixed.has(issue.id)} />
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

function IssueDetail({
  issue,
  fixed,
  chosen,
  peek,
}: {
  issue: SceneIssue
  fixed: boolean
  chosen: boolean
  peek: Peek
}) {
  const measure = measureFor(issue)
  const after = peek === 'after'
  return (
    <article className={`issue-card${fixed ? ' is-fixed' : ''}`} aria-live="polite">
      <p className="issue-card__kind">
        <IssueGlyph kind={issue.kind} fixed={fixed} />
        {ISSUE_KIND_LABEL[issue.kind]} · {issue.where}
      </p>
      <h3 className="issue-card__title">{issue.title}</h3>

      {/* Before / after, drawn in place on the map. */}
      <div className="compare-toggle issue-card__peek" role="group" aria-label="Show this street">
        <button
          type="button"
          className={!after ? 'is-active' : undefined}
          aria-pressed={!after}
          onClick={() => setPeek('before')}
        >
          Today
        </button>
        <button
          type="button"
          className={after ? 'is-active' : undefined}
          aria-pressed={after}
          onClick={() => setPeek('after')}
        >
          With the fix
        </button>
      </div>
      <p className={`issue-card__map-hint${after ? ' is-after' : ''}`}>
        <span
          className="issue-card__swatch"
          style={{ color: after ? PROPOSED_COLOR : ISSUE_COLOR[issue.kind] }}
          aria-hidden="true"
        />
        {after
          ? fixed
            ? `On the map: ${PATCH_LABEL[issue.kind].toLowerCase()}, outlined in blue as a proposal.`
            : `On the map: a blue preview of the ${PATCH_LABEL[issue.kind].toLowerCase()}. Press Improve to add it.`
          : 'On the map: the affected stretch pulses; dashed lines mark other open issues.'}
      </p>

      <p className="issue-card__text">{after ? measure.after : measure.before}</p>
      {!after && <p className="issue-card__fix">Fix: {issue.fix}</p>}
      {after && measure.metrics.length > 0 && (
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
