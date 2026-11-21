import { compareByIds, getDemoScenario } from '../data/api'
import { formatImprovement, formatMeters } from '../satellite/stats/format'

/**
 * Compare shows the routing result for the bundled Wellesley intervention.
 * There is no cost line here. A dollar figure would be a Gemini stub.
 */
export function CompareSheet() {
  const scenario = getDemoScenario()
  let beforeMeters: number | null = null
  let afterMeters: number | null = null
  let failed = false
  try {
    const modeled = compareByIds({
      scenarioId: scenario.id,
      interventionId: scenario.interventionId,
    })
    beforeMeters = modeled.beforeMeters
    afterMeters = modeled.afterMeters
  } catch {
    failed = true
  }

  return (
    <section className="compare-sheet" aria-label="Modeled comparison">
      <h2 className="compare-sheet__title">Modeled route</h2>
      {failed ? (
        <p>Modeled route unavailable.</p>
      ) : (
        <p>
          {formatMeters(beforeMeters)} → {formatMeters(afterMeters)}.{' '}
          {formatImprovement(beforeMeters, afterMeters)}. Not a Gemini estimate.
        </p>
      )}
      <p className="compare-sheet__note">
        {scenario.originLabel} to {scenario.destinationLabel}. Calculated by
        the routing model for the bundled ramp.
      </p>
    </section>
  )
}
