import { potholeById, usePotholeFix } from '../city/potholeFix'
import { compareByIds, getDemoScenario } from '../data/api'
import { formatImprovement, formatMeters } from '../satellite/stats/format'

/**
 * Compare shows the routing result for the bundled Wellesley intervention.
 * There is no cost line here. A dollar figure would be a Gemini stub.
 */
export function CompareSheet() {
  const fix = usePotholeFix()
  const hole = potholeById(fix.selectedId)
  const patched = hole ? fix.patchedIds.includes(hole.id) : false
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
    <section className="mode-page compare-sheet" aria-label="Modeled comparison">
      {hole && (
        <>
          <h2 className="compare-sheet__title">{hole.label}</h2>
          <dl className="compare-sheet__meters">
            <div>
              <dt>Before</dt>
              <dd>Open</dd>
            </div>
            <div>
              <dt>After</dt>
              <dd>{patched ? 'Patched' : 'Open'}</dd>
            </div>
          </dl>
          <p>
            {patched
              ? 'The lane is even in this demo.'
              : 'Still open. Patch it from the city or from Improve.'}{' '}
            Not a Gemini estimate. This patch does not change the modeled route
            below.
          </p>
        </>
      )}
      <h2 className="compare-sheet__title">Before and after</h2>
      {failed ? (
        <p>Modeled route unavailable.</p>
      ) : (
        <>
          <dl className="compare-sheet__meters">
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
      <p className="compare-sheet__note">
        {scenario.originLabel} to {scenario.destinationLabel}. Calculated by
        the routing model for the bundled ramp.
      </p>
    </section>
  )
}
