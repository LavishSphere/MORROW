import { useEffect } from 'react'
import { ISSUE_KIND_LABEL, type IssueKind, type IssueMeasure } from '../../shared/issues.ts'
import { useCityState } from '../showcase/cityStore'
import { measureFor, selectIssue, setShowBefore, useIssueState } from '../showcase/issueStore'
import { buildingsNear, NEAR_METERS, PEOPLE_METHOD, peopleIn, placesNear } from '../showcase/people'
import { IssueGlyph } from './IssueGlyph'

/** Who each kind of fix helps, from standard accessibility guidance. */
const WHO_BENEFITS: Record<IssueKind, string[]> = {
  stairs: ['Wheelchair users', 'People pushing strollers or carts', 'Older adults and walker users'],
  unmarked_crossing: [
    'Everyone crossing here',
    'Blind and low-vision pedestrians (tactile paving)',
    'Wheelchair users (curb ramps)',
  ],
  no_sidewalk: ['People now walking in the road', 'Kids walking to school', 'Wheelchair and stroller users'],
  unpaved_path: ['Wheelchair, walker, and stroller users', 'People with canes or crutches'],
}

/** Metres from a value like "218 m"; null for anything else. */
function metersOf(value: string | undefined) {
  const match = value?.match(/^(\d+) m$/)
  return match ? Number(match[1]) : null
}

/** Modeled metres a ramp saves, when the routing model found a detour. */
function detourSaved(measure: IssueMeasure) {
  if (!measure.modeled) return null
  const before = metersOf(measure.metrics[0]?.value)
  const after = metersOf(measure.metrics[1]?.value)
  return before !== null && after !== null ? Math.max(0, before - after) : null
}

/**
 * Compare: the city today versus with the resident's fixes, and what those
 * fixes are worth: who they help, what is nearby, and the totals.
 */
export function IssueComparisons() {
  const { issues, fixed, showBefore } = useIssueState()
  const { map } = useCityState()
  const improved = issues.filter((issue) => fixed.has(issue.id))

  // Leaving Compare always puts the fixes back on the map.
  useEffect(() => () => setShowBefore(false), [])

  if (improved.length === 0) {
    return (
      <div className="issue-compare">
        <h2 className="compare-sheet__title">Your improvements</h2>
        <p className="mode-page__lead">
          Nothing improved yet. Click a marker on the map, or open Improve, and press Improve on an
          issue. Its benefits show up here.
        </p>
      </div>
    )
  }

  let ramps = 0
  let detour = 0
  let crossings = 0
  let sidewalk = 0
  let paved = 0
  // Buildings near any fix, counted once even when two fixes share them.
  const nearBuildings = new Set<number>()
  const groups = new Set<string>()
  const rows = improved.map((issue) => {
    const measure = measureFor(issue)
    const buildings = map ? buildingsNear(map, issue.x, issue.z) : []
    buildings.forEach((b) => nearBuildings.add(b))
    const near = {
      people: map ? peopleIn(map, buildings) : 0,
      names: map ? placesNear(map, issue.x, issue.z) : [],
    }
    WHO_BENEFITS[issue.kind].forEach((g) => groups.add(g))
    if (issue.kind === 'stairs') {
      ramps += 1
      detour += detourSaved(measure) ?? 0
    }
    if (issue.kind === 'unmarked_crossing') crossings += 1
    if (issue.kind === 'no_sidewalk') sidewalk += metersOf(measure.metrics[1]?.value) ?? 0
    if (issue.kind === 'unpaved_path') paved += metersOf(measure.metrics[0]?.value) ?? 0
    return { issue, measure, near }
  })

  const stats = [
    ramps > 0 && { value: String(ramps), label: ramps === 1 ? 'step-free route' : 'step-free routes' },
    detour > 0 && { value: `${detour} m`, label: 'wheelchair detour removed (modeled)' },
    crossings > 0 && { value: String(crossings), label: crossings === 1 ? 'crossing made safer' : 'crossings made safer' },
    sidewalk > 0 && { value: `${sidewalk} m`, label: 'new sidewalk' },
    paved > 0 && { value: `${paved} m`, label: 'path paved' },
    {
      value: `≈ ${map ? peopleIn(map, nearBuildings) : 0}`,
      label: `people live within ${NEAR_METERS} m of a fix (estimate)`,
    },
  ].filter((stat): stat is { value: string; label: string } => Boolean(stat))

  return (
    <div className="issue-compare">
      <div className="compare-toggle" role="group" aria-label="Show the city">
        <button
          type="button"
          className={showBefore ? 'is-active' : undefined}
          aria-pressed={showBefore}
          onClick={() => setShowBefore(true)}
        >
          Today
        </button>
        <button
          type="button"
          className={!showBefore ? 'is-active' : undefined}
          aria-pressed={!showBefore}
          onClick={() => setShowBefore(false)}
        >
          With your fixes
        </button>
      </div>

      <h2 className="compare-sheet__title">Benefits of your fixes</h2>
      <dl className="benefit-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dd>{stat.value}</dd>
            <dt>{stat.label}</dt>
          </div>
        ))}
      </dl>

      <p className="issue-list__head">Who it helps</p>
      <ul className="benefit-groups">
        {[...groups].map((group) => (
          <li key={group}>{group}</li>
        ))}
      </ul>

      <p className="issue-list__head">Each fix</p>
      <ul className="issue-compare__list">
        {rows.map(({ issue, measure, near }) => (
          <li key={issue.id} className="issue-compare__item">
            <p className="issue-card__kind">
              <IssueGlyph kind={issue.kind} />
              {ISSUE_KIND_LABEL[issue.kind]} · {issue.where}
            </p>
            <dl className="issue-compare__pair">
              <div>
                <dt>Today</dt>
                <dd>{measure.before}</dd>
              </div>
              <div>
                <dt>With the fix</dt>
                <dd>{measure.after}</dd>
              </div>
            </dl>
            <p className="benefit-near">
              About <strong>{near.people} people</strong> live within {NEAR_METERS} m
              {near.names.length > 0 ? `, near ${near.names.join(', ')}` : ''}. Helps{' '}
              {WHO_BENEFITS[issue.kind][0]?.toLowerCase()} and more.
            </p>
            <div className="benefit-row">
              <span className="compare-sheet__note">
                {measure.modeled ? 'Modeled with the routing graph.' : 'Measured from the map.'} Not a Gemini estimate.
              </span>
              <button type="button" className="benefit-show" onClick={() => selectIssue(issue.id)}>
                Show me
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="compare-sheet__note benefit-method">{PEOPLE_METHOD}</p>
    </div>
  )
}
