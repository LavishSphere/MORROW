import { ISSUE_KIND_LABEL } from '../../shared/issues.ts'
import { measureFor, useIssueState } from '../showcase/issueStore'

/** Metres from a value like "218 m"; null for anything else. */
function metersOf(value: string | undefined) {
  const match = value?.match(/^(\d+) m$/)
  return match ? Number(match[1]) : null
}

/**
 * Compare: before and after for every issue the resident has improved,
 * with running totals.
 */
export function IssueComparisons() {
  const { issues, fixed } = useIssueState()
  const improved = issues.filter((issue) => fixed.has(issue.id))

  if (improved.length === 0) {
    return (
      <p className="mode-page__lead">
        Improve issues on the map or in Improve to compare them here.
      </p>
    )
  }

  let sidewalk = 0
  let paved = 0
  let ramps = 0
  let crossings = 0
  for (const issue of improved) {
    const measure = measureFor(issue)
    if (issue.kind === 'no_sidewalk') sidewalk += metersOf(measure.metrics[1]?.value) ?? 0
    if (issue.kind === 'unpaved_path') paved += metersOf(measure.metrics[0]?.value) ?? 0
    if (issue.kind === 'stairs') ramps += 1
    if (issue.kind === 'unmarked_crossing') crossings += 1
  }
  const totals = [
    ramps && `${ramps} step-free ramp${ramps === 1 ? '' : 's'}`,
    crossings && `${crossings} marked crossing${crossings === 1 ? '' : 's'}`,
    sidewalk && `${sidewalk} m of new sidewalk`,
    paved && `${paved} m of paved path`,
  ].filter(Boolean)

  return (
    <div className="issue-compare">
      <h2 className="compare-sheet__title">Your improvements</h2>
      <p className="issue-compare__totals">{totals.join(' · ')}</p>
      <ul className="issue-compare__list">
        {improved.map((issue) => {
          const measure = measureFor(issue)
          return (
            <li key={issue.id} className="issue-compare__item">
              <p className="issue-card__kind">
                {ISSUE_KIND_LABEL[issue.kind]} · {issue.where}
              </p>
              <dl className="issue-compare__pair">
                <div>
                  <dt>Before</dt>
                  <dd>{measure.before}</dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>{measure.after}</dd>
                </div>
              </dl>
              <p className="compare-sheet__note">
                {measure.modeled ? 'Modeled with the routing graph.' : 'Measured from the map.'} Not a
                Gemini estimate.
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
