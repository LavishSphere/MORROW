/**
 * Judge-facing Compare entry.
 *
 *   import { compareScenario } from '@morrow/routing'
 *
 * Client sends **ids only**. Loads Wellesley basemap + demo-dataset, then
 * calls Sophia’s compareScenario. Do not vendor a second routing package.
 * compareIntervention remains for package tests; the UI uses compareScenario.
 */

import { compareScenario } from '@morrow/routing'
import type { RouteComparison } from '@morrow/routing'
import basemap from '../../data/wellesley/basemap.geojson'
import demoDataset from '../../data/wellesley/demo-dataset.json'
import { getIntervention } from './fixtures'

export type CompareResult = RouteComparison & {
  scenarioId: string
  interventionId: string
  source: 'morrow-routing'
  routingPackageAvailable: boolean
}

type DemoFile = {
  scenario: {
    id: string
    origin: [number, number]
    destination: [number, number]
    graphChanges: Array<{
      edgeId: string
      accessible: boolean
      weight?: number
    }>
    barrierId: string
    interventionId: string
  }
  interventions: Array<{
    id: string
    graphChanges: Array<{
      edgeId: string
      accessible: boolean
      weight?: number
    }>
  }>
}

const demo = demoDataset as unknown as DemoFile

export function compareByIds(input: {
  scenarioId: string
  interventionId: string
}): CompareResult {
  const scenario = demo.scenario
  if (input.scenarioId && input.scenarioId !== scenario.id) {
    throw new Error(
      `Unknown scenario id: ${input.scenarioId} (only ${scenario.id} is bundled)`,
    )
  }

  const intervention =
    demo.interventions.find((i) => i.id === input.interventionId) ??
    getIntervention(input.interventionId)

  if (!intervention) {
    throw new Error(`Unknown intervention id: ${input.interventionId}`)
  }

  // Canonical graphChanges from the bundled intervention — ids only from client.
  const comparison = compareScenario(basemap, {
    origin: scenario.origin,
    destination: scenario.destination,
    graphChanges: intervention.graphChanges,
  })

  return {
    ...comparison,
    scenarioId: scenario.id,
    interventionId: intervention.id,
    source: 'morrow-routing',
    routingPackageAvailable: true,
  }
}
