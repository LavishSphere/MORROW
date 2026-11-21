import { RoutingError } from "./errors.ts";
import type { PedestrianGraph } from "./types.ts";

export function validateGraph(graph: PedestrianGraph): void {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new RoutingError("Graph must include nodes and edges.");
  }
  if (graph.nodes.length === 0) {
    throw new RoutingError("Graph must include at least one node.");
  }

  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (typeof node?.id !== "string" || node.id.length === 0) {
      throw new RoutingError("Every node needs an id.");
    }
    if (nodeIds.has(node.id)) {
      throw new RoutingError(`Duplicate node: ${node.id}`);
    }
    nodeIds.add(node.id);
    if (node.coordinates !== undefined) {
      const [longitude, latitude] = node.coordinates;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        throw new RoutingError(`Node ${node.id} has invalid coordinates.`);
      }
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (typeof edge?.id !== "string" || edge.id.length === 0) {
      throw new RoutingError("Every edge needs an id.");
    }
    if (edgeIds.has(edge.id)) {
      throw new RoutingError(`Duplicate edge: ${edge.id}`);
    }
    edgeIds.add(edge.id);
    if (typeof edge.from !== "string" || typeof edge.to !== "string") {
      throw new RoutingError(`Edge ${edge.id} needs from and to node ids.`);
    }
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new RoutingError(`Edge ${edge.id} references an unknown node.`);
    }
    if (typeof edge.accessible !== "boolean") {
      throw new RoutingError(`Edge ${edge.id} must set accessible.`);
    }
    if (!Number.isFinite(edge.lengthMeters) || edge.lengthMeters < 0) {
      throw new RoutingError(`Edge ${edge.id} has an invalid length.`);
    }
    if (
      edge.weight !== undefined &&
      (!Number.isFinite(edge.weight) || edge.weight < 0)
    ) {
      throw new RoutingError(`Edge ${edge.id} has an invalid weight.`);
    }
  }
}
