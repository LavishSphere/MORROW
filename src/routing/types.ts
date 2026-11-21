/**
 * Types aligned with Sophia’s `@morrow/routing` (#11 shortestPath, #12 compareIntervention).
 * Do NOT vendor a second routing package — when those PRs merge, import from `@morrow/routing`.
 */

export type GraphChange = {
  edgeId: string
  accessible: boolean
  weight?: number
}

export type RouteQuery = {
  originId: string
  destinationId: string
  requireAccessible: boolean
}

export type RoutePath = {
  reachable: boolean
  distanceMeters: number | null
  nodeIds: string[]
  edgeIds: string[]
  /** [lon, lat] along the path; empty when unreachable or coords missing. */
  geometry: Array<[number, number]>
}

/** Return shape of `compareIntervention(graph, query, graphChanges)`. */
export type RouteComparison = {
  before: RoutePath
  after: RoutePath
  beforeMeters: number | null
  afterMeters: number | null
  /** afterMeters − beforeMeters when both reachable. */
  deltaMeters: number | null
  becameReachable: boolean
  assumptions: string[]
}

export const MODELED_IMPACT_ASSUMPTIONS: readonly string[] = [
  'Demonstration-only street graph',
  'No site inspection or engineering feasibility assessment',
  'Results are modeled impact, not a claim of real-world infrastructure improvement',
]
