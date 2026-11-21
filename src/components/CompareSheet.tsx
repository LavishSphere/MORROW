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
    <section
      className="mode-page compare-sheet mx-auto flex w-full max-w-3xl flex-col items-center justify-center"
      aria-label="Modeled comparison"
    >
      <h2 className="compare-sheet__title text-center">Before and after</h2>
      {failed ? (
        <p>Modeled route unavailable.</p>
      ) : (
        <>
          <dl className="compare-sheet__meters w-full">
            <div>
              <dt>Before</dt>
              <dd>{formatMeters(beforeMeters)}</dd>
            </div>
            <div>
              <dt>After</dt>
              <dd>{formatMeters(afterMeters)}</dd>
            </div>
          </dl>
          <p>
            {formatImprovement(beforeMeters, afterMeters)}. Not a Gemini estimate.
          </p>
        </>
      )}
      <p className="compare-sheet__note text-center">
        {scenario.originLabel} to {scenario.destinationLabel}. Calculated by
        the routing model for the bundled ramp.
      </p>
    </section>
  )
}
