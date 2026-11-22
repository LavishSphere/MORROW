import { tryCompareByIds } from '../../data/compare'
import { SCENARIO } from '../../data/fixtures'
import { formatImprovement, formatMeters } from '../../satellite/stats/format'
import type { Issue, Kind } from './issue'

const ILLUSTRATIVE: Record<Kind, string> = {
  ramp: 'A wheelchair can roll from the footway onto the street.',
  pothole: 'A chair or stroller can cross an even lane.',
  sidewalk: 'The sidewalk is one continuous level path.',
  crossing: 'People can cross on an open curb.',
}

/** Benefit of the fix. The demo barrier uses the local model. Other issues stay illustrative. */
export function improvementLine(issue: Issue): string {
  if (issue.id !== SCENARIO.barrierId) {
    return `Illustrative. ${ILLUSTRATIVE[issue.kind]} No modeled route change.`
  }

  const compare = tryCompareByIds({
    scenarioId: SCENARIO.id,
    interventionId: SCENARIO.interventionId,
  })
  if (!compare) {
    return 'Illustrative. Modeled route unavailable.'
  }

  const before = formatMeters(compare.beforeMeters)
  const after = formatMeters(compare.afterMeters)
  const change = formatImprovement(compare.beforeMeters, compare.afterMeters)
  return `Illustrative modeled improvement: ${before} before → ${after} after. ${change}. No site inspection or engineering feasibility assessment.`
}
