import { ISSUE_KIND_LABEL } from '../../shared/issues.ts'
import type { IssueFact } from '../../shared/types.ts'
import { selectIssue, toggleChosen, useIssueState } from '../showcase/issueStore'

/**
 * Propose: pick which map issues go into the proposal. Improved issues are
 * added automatically; any issue can be added or removed here.
 */
export function ProposalIssuePicker() {
  const { issues, chosen, fixed, serverKnown } = useIssueState()
  const picked = issues.filter((issue) => chosen.has(issue.id))
  const suggestions = issues.filter((issue) => fixed.has(issue.id) && !chosen.has(issue.id))

  return (
    <section className="proposal-issues" aria-label="Issues in this proposal">
      <h3 className="proposal-issues__title">Issues in this proposal</h3>
      {picked.length === 0 ? (
        <p className="propose-sheet__lead">
          No issues picked yet. Improve issues on the map, or tick “Add to proposal” in Improve.
        </p>
      ) : (
        <ul className="proposal-issues__list">
          {[...picked, ...suggestions].map((issue) => (
            <li key={issue.id}>
              <label className="proposal-issues__item">
                <input
                  type="checkbox"
                  checked={chosen.has(issue.id)}
                  onChange={() => toggleChosen(issue.id)}
                />
                <span>
                  <strong>{issue.title}</strong> · {issue.where}
                  {fixed.has(issue.id) ? ' · improved' : ''}
                </span>
              </label>
              <button
                type="button"
                className="proposal-issues__show"
                onClick={() => selectIssue(issue.id)}
                aria-label={`Show ${issue.title} at ${issue.where} on the map`}
              >
                Show
              </button>
            </li>
          ))}
        </ul>
      )}
      {!serverKnown && picked.length > 0 && (
        <p className="propose-sheet__note">
          This loaded city is not on the server, so these issues are added in the browser, not checked by the API.
        </p>
      )}
    </section>
  )
}

/** The issues section of a finished proposal. */
export function ProposalIssueFacts({
  issues,
  title = 'Additional issues',
}: {
  issues: IssueFact[]
  title?: string
}) {
  if (issues.length === 0) return null
  return (
    <section>
      <h3>{title}</h3>
      <ul className="proposal-issues__facts">
        {issues.map((issue) => (
          <li key={issue.id}>
            <p>
              <strong>{issue.title}</strong> — {issue.where} (
              {ISSUE_KIND_LABEL[issue.kind as keyof typeof ISSUE_KIND_LABEL] ?? issue.kind})
            </p>
            <p>
              Before: {issue.before} After: {issue.after}
            </p>
            <p>Suggested fix: {issue.fix}</p>
            <p className="proposal-print__limitations">
              Community-reported in OpenStreetMap (
              <a href={issue.sourceUrl} target="_blank" rel="noreferrer">
                {issue.source}
              </a>
              ). {issue.modeled ? 'Distances are modeled.' : 'Measured from the map.'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The issues of an issues-only proposal, as a table officials can act on. */
export function ProposalIssueTable({ issues, title }: { issues: IssueFact[]; title: string }) {
  if (issues.length === 0) return null
  return (
    <section>
      <h3>{title}</h3>
      <table className="proposal-print__table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Location</th>
            <th scope="col">Issue</th>
            <th scope="col">Proposed improvement</th>
            <th scope="col">Today → after</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue, i) => (
            <tr key={issue.id}>
              <td>{i + 1}</td>
              <td>{issue.where}</td>
              <td>
                {issue.title}
                <span className="proposal-print__kind">
                  {ISSUE_KIND_LABEL[issue.kind as keyof typeof ISSUE_KIND_LABEL] ?? issue.kind}
                  {issue.modeled ? ' · modeled' : ' · measured'}
                </span>
              </td>
              <td>{issue.fix}</td>
              <td>
                {issue.before} → {issue.after}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
