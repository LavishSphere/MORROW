/**
 * import { compareIntervention } from '@morrow/routing'
 *
 * Client sends ids only. Loads demo graph + intervention.graphChanges, then
 * calls Sophia’s compareIntervention. Do not vendor a second routing package.
 */
import { compareIntervention } from '@morrow/routing'
import type { RouteComparison } from '@morrow/routing'
import { WELLESLEY_DEMO_GRAPH } from './demoGraph'
import { getIntervention, SCENARIO } from './fixtures'

export type CompareResult = RouteComparison & {
  scenarioId: string
  interventionId: string
  source: 'morrow-routing'
  routingPackageAvailable: boolean
}

export function compareByIds(input: {
  scenarioId: string
  interventionId: string
}): CompareResult {
  const intervention =
    getIntervention(input.interventionId) ??
    getIntervention(SCENARIO.interventionId)
  if (!intervention) {
    throw new Error(`Unknown intervention id: ${input.interventionId}`)
  }
  const comparison = compareIntervention(
    WELLESLEY_DEMO_GRAPH,
    {
      originId: SCENARIO.originId,
      destinationId: SCENARIO.destinationId,
      requireAccessible: true,
    },
    intervention.graphChanges,
  )
  return {
    ...comparison,
    scenarioId: input.scenarioId || SCENARIO.id,
    interventionId: intervention.id,
    source: 'morrow-routing',
    routingPackageAvailable: true,
  }
}
