import { getIntervention, SCENARIO } from './fixtures'
import {
  MODELED_IMPACT_ASSUMPTIONS,
  type RouteComparison,
  type RoutePath,
} from '../routing/types'

/**
 * Bundled stand-in for Sophia’s:
 *   compareIntervention(graph, query, graphChanges)
 *
 * Client callers pass **ids only**. When `@morrow/routing` lands (#11/#12),
 * replace the body with a real call that loads the demo graph + intervention
 * graphChanges by id — do not ship a second routing package here.
 */

type MockTrip = {
  beforeMeters: number
  afterMeters: number
  before: RoutePath
  after: RoutePath
}

const MOCK_BY_INTERVENTION: Record<string, MockTrip> = {
  'int-ramp-01': {
    beforeMeters: 620,
    afterMeters: 410,
    before: {
      reachable: true,
      distanceMeters: 620,
      nodeIds: ['origin', 'detour-a', 'detour-b', 'destination'],
      edgeIds: ['edge-detour-1', 'edge-detour-2', 'edge-detour-3'],
      geometry: [
        [-71.305, 42.292],
        [-71.306, 42.293],
        [-71.304, 42.294],
        [-71.3025, 42.2936],
      ],
    },
    after: {
      reachable: true,
      distanceMeters: 410,
      nodeIds: ['origin', 'crossing', 'destination'],
      edgeIds: ['edge-approach', 'edge-crossing-a', 'edge-finish'],
      geometry: [
        [-71.305, 42.292],
        [-71.3035, 42.293],
        [-71.3025, 42.2936],
      ],
    },
  },
  'int-path-02': {
    beforeMeters: 540,
    afterMeters: 380,
    before: {
      reachable: true,
      distanceMeters: 540,
      nodeIds: ['origin', 'around-1', 'around-2', 'destination'],
      edgeIds: ['edge-around-1', 'edge-around-2'],
      geometry: [
        [-71.3055, 42.294],
        [-71.3065, 42.295],
        [-71.3041, 42.2948],
      ],
    },
    after: {
      reachable: true,
      distanceMeters: 380,
      nodeIds: ['origin', 'connector', 'destination'],
      edgeIds: ['edge-to-connector', 'edge-connector-b'],
      geometry: [
        [-71.3055, 42.294],
        [-71.3048, 42.2945],
        [-71.3041, 42.2948],
      ],
    },
  },
}

/**
 * Id-only client entry. Looks up intervention `graphChanges` from fixtures
 * (mirrors what a future live path would load before calling compareIntervention).
 */
export function compareInterventionByIds(input: {
  scenarioId: string
  interventionId: string
}): RouteComparison & {
  scenarioId: string
  interventionId: string
  source: 'bundled-mock' | 'morrow-routing'
  routingPackageAvailable: boolean
} {
  const intervention = getIntervention(input.interventionId)
  // graphChanges are resolved by id for the future live handoff; mock uses trip table.
  void intervention?.graphChanges
  void input.scenarioId

  const trip =
    MOCK_BY_INTERVENTION[input.interventionId] ??
    MOCK_BY_INTERVENTION[SCENARIO.interventionId]

  const beforeMeters = trip.beforeMeters
  const afterMeters = trip.afterMeters
  const deltaMeters = afterMeters - beforeMeters

  return {
    before: trip.before,
    after: trip.after,
    beforeMeters,
    afterMeters,
    deltaMeters,
    becameReachable: trip.after.reachable && !trip.before.reachable,
    assumptions: [...MODELED_IMPACT_ASSUMPTIONS],
    scenarioId: input.scenarioId || SCENARIO.id,
    interventionId: input.interventionId,
    source: 'bundled-mock',
    routingPackageAvailable: false,
  }
}
