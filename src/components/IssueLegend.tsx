import { useMemo, useState } from 'react'
import { ISSUE_KIND_LABEL, type IssueKind } from '../../shared/issues.ts'
import { useIssueState } from '../showcase/issueStore'
import { ISSUE_COLOR, ISSUE_SEVERITY } from '../showcase/issueVisuals'
import { IssueGlyph } from './IssueGlyph'

const KINDS = (Object.keys(ISSUE_KIND_LABEL) as IssueKind[]).sort(
  (a, b) => ISSUE_SEVERITY[b] - ISSUE_SEVERITY[a],
)

/**
 * Map key for the issue pins: what each shape and colour means, how many are
 * open, and how the affected stretch and a proposed fix are drawn.
 */
export function IssueLegend() {
  const { issues, fixed } = useIssueState()
  const [open, setOpen] = useState(true)
  const counts = useMemo(() => {
    const out: Partial<Record<IssueKind, number>> = {}
    for (const issue of issues) if (!fixed.has(issue.id)) out[issue.kind] = (out[issue.kind] ?? 0) + 1
    return out
  }, [issues, fixed])

  if (issues.length === 0) return null

  if (!open) {
    return (
      <button type="button" className="issue-legend issue-legend--pill" aria-expanded={false} onClick={() => setOpen(true)}>
        Map key
      </button>
    )
  }

  return (
    <section className="issue-legend" aria-label="Map key for accessibility issues">
      <div className="issue-legend__head">
        <p className="issue-legend__title">Map key</p>
        <button
          type="button"
          className="issue-legend__close"
          aria-label="Hide map key"
          aria-expanded
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>
      <ul className="issue-legend__list">
        {KINDS.filter((kind) => counts[kind]).map((kind) => (
          <li key={kind}>
            <IssueGlyph kind={kind} />
            <span>{ISSUE_KIND_LABEL[kind]}</span>
            <span className="issue-legend__count">{counts[kind]}</span>
          </li>
        ))}
        {fixed.size > 0 && (
          <li>
            <IssueGlyph kind="no_sidewalk" fixed />
            <span>Improved</span>
            <span className="issue-legend__count">{fixed.size}</span>
          </li>
        )}
      </ul>
      <ul className="issue-legend__list issue-legend__lines">
        <li>
          <span
            className="issue-legend__line is-dashed"
            style={{ color: ISSUE_COLOR.no_sidewalk }}
            aria-hidden="true"
          />
          <span>Affected stretch</span>
        </li>
        <li>
          <span className="issue-legend__line is-proposed" aria-hidden="true" />
          <span>Proposed fix</span>
        </li>
      </ul>
      <p className="issue-legend__hint">Click a pin to see the fix in place.</p>
    </section>
  )
}
