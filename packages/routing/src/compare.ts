import { applyGraphChanges } from "./apply-changes.ts";
import { shortestPath } from "./shortest-path.ts";
import type { GraphChange, PedestrianGraph, RouteComparison, RouteQuery } from "./types.ts";

export const MODELED_IMPACT_ASSUMPTIONS: readonly string[] = [
  "Demonstration-only street graph",
  "No site inspection or engineering feasibility assessment",
  "Results are modeled impact, not a claim of real-world infrastructure improvement",
];

/**
 * Accessible (or unconstrained) shortest path before and after an intervention.
 * Distances are recomputed. They are not stored as constants.
 */
export function compareIntervention(
  graph: PedestrianGraph,
  query: RouteQuery,
  graphChanges: GraphChange[],
): RouteComparison {
  const before = shortestPath(graph, query);
  const after = shortestPath(applyGraphChanges(graph, graphChanges), query);

  let deltaMeters: number | null = null;
  if (before.distanceMeters !== null && after.distanceMeters !== null) {
    deltaMeters = after.distanceMeters - before.distanceMeters;
  }

  return {
    before,
    after,
    beforeMeters: before.distanceMeters,
    afterMeters: after.distanceMeters,
    deltaMeters,
    becameReachable: after.reachable && !before.reachable,
    assumptions: [...MODELED_IMPACT_ASSUMPTIONS],
  };
}
