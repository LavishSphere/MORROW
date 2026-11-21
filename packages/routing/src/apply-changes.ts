import { RoutingError } from "./errors.ts";
import type { GraphChange, GraphEdge, PedestrianGraph } from "./types.ts";
import { validateGraph } from "./validate.ts";

function validateChange(change: GraphChange): void {
  if (typeof change?.edgeId !== "string" || change.edgeId.length === 0) {
    throw new RoutingError("Every graph change needs an edgeId.");
  }
  if (typeof change.accessible !== "boolean") {
    throw new RoutingError(`Graph change for ${change.edgeId} must set accessible.`);
  }
  if (
    change.weight !== undefined &&
    (!Number.isFinite(change.weight) || change.weight < 0)
  ) {
    throw new RoutingError(`Graph change for ${change.edgeId} has an invalid weight.`);
  }
}

/**
 * Return a new graph with intervention edits applied.
 * Nodes are reused. Edges are copied so the input graph is not mutated.
 * Repeated edits to the same edgeId apply in order; the last one wins.
 */
export function applyGraphChanges(
  graph: PedestrianGraph,
  changes: GraphChange[],
): PedestrianGraph {
  validateGraph(graph);
  if (!Array.isArray(changes)) {
    throw new RoutingError("graphChanges must be an array.");
  }

  const indexById = new Map<string, number>();
  const edges: GraphEdge[] = graph.edges.map((edge, index) => {
    indexById.set(edge.id, index);
    return { ...edge };
  });

  for (const change of changes) {
    validateChange(change);
    const index = indexById.get(change.edgeId);
    if (index === undefined) {
      throw new RoutingError(`Unknown edge: ${change.edgeId}`);
    }
    const edge = edges[index];
    if (!edge) {
      throw new RoutingError(`Unknown edge: ${change.edgeId}`);
    }
    edge.accessible = change.accessible;
    if (change.weight !== undefined) {
      edge.weight = change.weight;
    }
  }

  return { nodes: graph.nodes, edges };
}
