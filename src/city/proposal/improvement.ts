import { tryCompareByIds } from '../../data/compare'
import { SCENARIO } from '../../data/fixtures'
import type { Issue, Kind } from './issue'

const ILLUSTRATIVE: Record<Kind, string> = {
  ramp: 'A wheelchair can roll from the footway onto the street.',
  pothole: 'A chair or stroller can cross an even lane.',
  sidewalk: 'The sidewalk is one continuous level path.',
  crossing: 'People can cross on an open curb.',
}

function modeledLine(
  beforeMeters: number | null,
  afterMeters: number | null,
): string {
  const beforeMissing = beforeMeters == null || !Number.isFinite(beforeMeters)
  const afterMissing = afterMeters == null || !Number.isFinite(afterMeters)
  if (beforeMissing && !afterMissing) {
    const meters = Math.round(afterMeters).toLocaleString('en-US')
    return `Became reachable, about ${meters} m.`
  }
  if (!beforeMissing && afterMissing) return 'No longer reachable'
  if (beforeMissing || afterMissing) return 'No modeled change'
  const delta = Math.round(afterMeters) - Math.round(beforeMeters)
  if (delta === 0) return 'Same distance'
  const amount = `${Math.abs(delta).toLocaleString('en-US')} m`
  return delta < 0 ? `${amount} shorter` : `${amount} longer`
}

/** Benefit of the fix. The demo barrier uses the local model. Other issues stay illustrative. */
export function improvementLine(issue: Issue): string {
  if (issue.id !== SCENARIO.barrierId) {
    return `Illustrative. ${ILLUSTRATIVE[issue.kind]}`
  }
  const compare = tryCompareByIds({
    scenarioId: SCENARIO.id,
    interventionId: SCENARIO.interventionId,
  })
  if (!compare) return `Illustrative. ${ILLUSTRATIVE.ramp}`
  return modeledLine(compare.beforeMeters, compare.afterMeters)
}
