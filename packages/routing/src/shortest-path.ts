import { RoutingError } from "./errors.ts";
import { haversineMeters } from "./from-geojson.ts";
import type { GraphEdge, GraphNode, PedestrianGraph, RoutePath, RouteQuery } from "./types.ts";
import { validateGraph } from "./validate.ts";

type Step = { nodeId: string; edgeId: string } | null;

const HEURISTIC_SLACK_METERS = 0.01;

/**
 * Accessible shortest path on a small pedestrian graph.
 * Search is A* with a haversine heuristic when every edge cost is at least
 * the straight-line distance of its endpoints. Otherwise the heuristic is 0
 * and the search is Dijkstra. Search minimizes weight (lengthMeters when
 * weight is omitted). The returned distance is the sum of lengthMeters.
 */
export function shortestPath(graph: PedestrianGraph, query: RouteQuery): RoutePath {
  validateGraph(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodes.has(query.originId)) {
    throw new RoutingError(`Unknown origin: ${query.originId}`);
  }
  if (!nodes.has(query.destinationId)) {
    throw new RoutingError(`Unknown destination: ${query.destinationId}`);
  }

  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }
  for (const list of outgoing.values()) {
    list.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }

  const heuristic = buildHeuristic(nodes, graph, query.destinationId);

  const cost = new Map<string, number>([[query.originId, 0]]);
  const distance = new Map<string, number>([[query.originId, 0]]);
  const previous = new Map<string, Step>([[query.originId, null]]);
  const unsettled = new Set<string>(graph.nodes.map((node) => node.id));

  while (unsettled.size > 0) {
    let current: string | null = null;
    let bestF = Infinity;
    let bestG = Infinity;
    for (const id of unsettled) {
      const g = cost.get(id);
      if (g === undefined) continue;
      const f = g + heuristic(id);
      if (
        f < bestF ||
        (f === bestF && g < bestG) ||
        (f === bestF && g === bestG && (current === null || id < current))
      ) {
        bestF = f;
        bestG = g;
        current = id;
      }
    }
    if (current === null) break;
    unsettled.delete(current);
    if (current === query.destinationId) break;

    for (const edge of outgoing.get(current) ?? []) {
      if (query.requireAccessible && !edge.accessible) continue;
      if (!unsettled.has(edge.to)) continue;
      const nextCost = bestG + (edge.weight ?? edge.lengthMeters);
      const known = cost.get(edge.to);
      if (known !== undefined && nextCost >= known) continue;
      cost.set(edge.to, nextCost);
      distance.set(edge.to, (distance.get(current) ?? 0) + edge.lengthMeters);
      previous.set(edge.to, { nodeId: current, edgeId: edge.id });
    }
  }

  if (!previous.has(query.destinationId)) {
    return {
      reachable: false,
      distanceMeters: null,
      nodeIds: [],
      edgeIds: [],
      geometry: [],
    };
  }

  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  let cursor: string | null = query.destinationId;
  const seen = new Set<string>();
  while (cursor !== null) {
    if (seen.has(cursor)) {
      throw new RoutingError("Path reconstruction found a cycle.");
    }
    seen.add(cursor);
    nodeIds.push(cursor);
    const step = previous.get(cursor);
    if (step === undefined || step === null) break;
    edgeIds.push(step.edgeId);
    cursor = step.nodeId;
  }
  nodeIds.reverse();
  edgeIds.reverse();

  let geometry: Array<[number, number]> = [];
  const coordinates = nodeIds.map((id) => nodes.get(id)?.coordinates);
  if (coordinates.every((point) => point !== undefined)) {
    geometry = coordinates.map((point) => [point[0], point[1]]);
  }

  return {
    reachable: true,
    distanceMeters: distance.get(query.destinationId) ?? 0,
    nodeIds,
    edgeIds,
    geometry,
  };
}

function buildHeuristic(
  nodes: Map<string, GraphNode>,
  graph: PedestrianGraph,
  destinationId: string,
): (nodeId: string) => number {
  const dest = nodes.get(destinationId)?.coordinates;
  if (!dest) return () => 0;
  if (!heuristicIsAdmissible(nodes, graph)) return () => 0;

  return (nodeId: string) => {
    const here = nodes.get(nodeId)?.coordinates;
    if (!here) return 0;
    return haversineMeters(here, dest);
  };
}

/** Haversine is only safe when every edge cost dominates its own straight-line span. */
function heuristicIsAdmissible(
  nodes: Map<string, GraphNode>,
  graph: PedestrianGraph,
): boolean {
  for (const edge of graph.edges) {
    const from = nodes.get(edge.from)?.coordinates;
    const to = nodes.get(edge.to)?.coordinates;
    if (!from || !to) continue;
    const cost = edge.weight ?? edge.lengthMeters;
    if (cost + HEURISTIC_SLACK_METERS < haversineMeters(from, to)) {
      return false;
    }
  }
  return true;
}
