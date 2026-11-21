import { compareIntervention } from "./compare.ts";
import { RoutingError } from "./errors.ts";
import {
  edgeBelongsToWay,
  fromWalkableGeoJSON,
  haversineMeters,
  type LonLat,
} from "./from-geojson.ts";
import type {
  GraphChange,
  PedestrianGraph,
  RouteComparison,
  RouteQuery,
} from "./types.ts";

export type DemoScenarioQuery = {
  origin: LonLat;
  destination: LonLat;
  graphChanges: GraphChange[];
};

function asLonLat(value: unknown, label: string): LonLat {
  if (!Array.isArray(value) || value.length < 2) {
    throw new RoutingError(`${label} must be [longitude, latitude].`);
  }
  const longitude = value[0];
  const latitude = value[1];
  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new RoutingError(`${label} must be [longitude, latitude].`);
  }
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new RoutingError(`${label} must be [longitude, latitude].`);
  }
  return [longitude, latitude];
}

function undirectedNeighbors(graph: PedestrianGraph): Map<string, string[]> {
  const neighbors = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = neighbors.get(from);
    if (list) list.push(to);
    else neighbors.set(from, [to]);
  };
  for (const node of graph.nodes) neighbors.set(node.id, neighbors.get(node.id) ?? []);
  for (const edge of graph.edges) {
    add(edge.from, edge.to);
    add(edge.to, edge.from);
  }
  return neighbors;
}

function largestComponent(graph: PedestrianGraph): Set<string> {
  const neighbors = undirectedNeighbors(graph);
  const seen = new Set<string>();
  let best: string[] = [];
  for (const node of graph.nodes) {
    if (seen.has(node.id)) continue;
    const stack = [node.id];
    const members: string[] = [];
    seen.add(node.id);
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      members.push(current);
      for (const next of neighbors.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    members.sort();
    if (
      members.length > best.length ||
      (members.length === best.length && (best[0] ?? "") > (members[0] ?? ""))
    ) {
      best = members;
    }
  }
  return new Set(best);
}

/**
 * Snap a WGS84 point to the nearest graph node.
 * Defaults to the largest connected component so a campus coordinate that
 * sits on a disconnected stub still maps onto the walkable network.
 */
export function snapNearestNode(
  graph: PedestrianGraph,
  point: LonLat,
  options: { largestComponent?: boolean; component?: Set<string> } = {},
): string {
  const allowed =
    options.component ??
    (options.largestComponent === false ? null : largestComponent(graph));
  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (const node of graph.nodes) {
    if (allowed && !allowed.has(node.id)) continue;
    if (!node.coordinates) continue;
    const distance = haversineMeters(point, node.coordinates);
    if (
      distance < bestDistance ||
      (distance === bestDistance && (bestId === null || node.id < bestId))
    ) {
      bestDistance = distance;
      bestId = node.id;
    }
  }
  if (bestId === null) {
    throw new RoutingError("Graph nodes need coordinates to snap a lon/lat.");
  }
  return bestId;
}

/**
 * Scenario graphChanges name whole OSM ways. The walkable graph stores one
 * directed segment per vertex pair, so expand onto every matching edge.
 * Optional search weight is spread across those segments by length.
 */
export function expandWayGraphChanges(
  graph: PedestrianGraph,
  changes: GraphChange[],
): GraphChange[] {
  if (!Array.isArray(changes)) {
    throw new RoutingError("graphChanges must be an array.");
  }
  const expanded: GraphChange[] = [];
  for (const change of changes) {
    const matches = graph.edges.filter((edge) =>
      edgeBelongsToWay(edge.id, change.edgeId),
    );
    if (matches.length === 0) {
      throw new RoutingError(`Unknown edge: ${change.edgeId}`);
    }
    const totalLength = matches.reduce((sum, edge) => sum + edge.lengthMeters, 0);
    for (const edge of matches) {
      const next: GraphChange = {
        edgeId: edge.id,
        accessible: change.accessible,
      };
      if (change.weight !== undefined) {
        next.weight =
          totalLength > 0
            ? change.weight * (edge.lengthMeters / totalLength)
            : change.weight / matches.length;
      }
      expanded.push(next);
    }
  }
  return expanded;
}

export function scenarioQuery(
  graph: PedestrianGraph,
  origin: LonLat,
  destination: LonLat,
): RouteQuery {
  const component = largestComponent(graph);
  return {
    originId: snapNearestNode(graph, origin, { component }),
    destinationId: snapNearestNode(graph, destination, { component }),
    requireAccessible: true,
  };
}

export function walkableGraphForScenario(
  collection: unknown,
  graphChanges: GraphChange[],
): PedestrianGraph {
  if (!Array.isArray(graphChanges)) {
    throw new RoutingError("graphChanges must be an array.");
  }
  const inaccessibleWayIds = graphChanges
    .filter((change) => change.accessible)
    .map((change) => change.edgeId);
  return fromWalkableGeoJSON(collection, { inaccessibleWayIds });
}

/**
 * Build the walkable graph from an extract, snap the trip, apply way-level
 * graphChanges, and recompute before/after. Ways the intervention unlocks
 * start inaccessible (missing ramp / blocked path).
 */
export function compareScenario(
  collection: unknown,
  scenario: DemoScenarioQuery,
): RouteComparison {
  const origin = asLonLat(scenario.origin, "origin");
  const destination = asLonLat(scenario.destination, "destination");
  const graph = walkableGraphForScenario(collection, scenario.graphChanges);
  const query = scenarioQuery(graph, origin, destination);
  return compareIntervention(
    graph,
    query,
    expandWayGraphChanges(graph, scenario.graphChanges),
  );
}
