import { mergeAssumptions } from "./assumptions.js";
import { applyGraphChanges } from "./graph.js";
import { findShortestPath } from "./pathfinding.js";
import type {
  GraphChange,
  ModeledComparison,
  ModeledRouteMetrics,
  PedestrianScenario,
  RouteQuery,
  WalkableGraph,
} from "./types.js";

export type CompareInput = {
  scenarioId: string;
  interventionId: string;
  graph: WalkableGraph;
  query: RouteQuery;
  graphChanges: readonly GraphChange[];
  assumptions?: readonly string[];
};

/**
 * Recompute accessible shortest path before and after graphChanges.
 * Browser preview and POST /api/proposals/generate should both call this.
 */
export function compareBeforeAfter(input: CompareInput): ModeledComparison {
  const modelAssumptions = mergeAssumptions(input.assumptions);
  const before = findShortestPath(input.graph, input.query);
  const afterGraph = applyGraphChanges(input.graph, input.graphChanges);
  const after = findShortestPath(afterGraph, input.query);

  const deltaMeters =
    before.found && after.found
      ? after.distanceMeters - before.distanceMeters
      : null;

  return {
    before,
    after,
    deltaMeters,
    modelAssumptions,
    scenarioId: input.scenarioId,
    interventionId: input.interventionId,
  };
}

export function compareScenario(
  scenario: PedestrianScenario,
): ModeledComparison {
  return compareBeforeAfter({
    scenarioId: scenario.id,
    interventionId: scenario.interventionId,
    graph: scenario.graph,
    query: {
      originId: scenario.originId,
      destinationId: scenario.destinationId,
      requireWheelchairAccessible: true,
    },
    graphChanges: scenario.graphChanges,
    ...(scenario.assumptions !== undefined
      ? { assumptions: scenario.assumptions }
      : {}),
  });
}

/** Shape used when assembling ProposalFacts.modeledRoute fields. */
export function toModeledRouteMetrics(
  comparison: ModeledComparison,
): ModeledRouteMetrics {
  return {
    beforeMeters: comparison.before.found
      ? comparison.before.distanceMeters
      : null,
    afterMeters: comparison.after.found
      ? comparison.after.distanceMeters
      : null,
    newlyReachableDestinations: null,
    modelAssumptions: comparison.modelAssumptions,
    unit: "meters",
  };
}
