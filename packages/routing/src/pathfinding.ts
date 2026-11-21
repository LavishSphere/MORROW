import { indexGraph } from "./graph.js";
import type {
  Coordinates,
  EdgeId,
  NodeId,
  RouteQuery,
  RouteResult,
  WalkableGraph,
} from "./types.js";

type Tentative = {
  distance: number;
  viaEdgeId: EdgeId | null;
  prevNodeId: NodeId | null;
};

/**
 * Euclidean heuristic for A*. Works for lon/lat demos at small extents
 * and for synthetic planar meter graphs alike (consistent units on both axes).
 */
function heuristic(
  a: Coordinates,
  b: Coordinates,
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

/**
 * A* shortest path on a weighted walkable graph.
 * With a zero heuristic this is Dijkstra; we use Euclidean for speed on larger extracts.
 */
export function findShortestPath(
  graph: WalkableGraph,
  query: RouteQuery,
): RouteResult {
  const requireAccessible = query.requireWheelchairAccessible !== false;
  const indexed = indexGraph(graph);

  if (!indexed.nodesById.has(query.originId)) {
    throw new Error(`Unknown originId: ${query.originId}`);
  }
  if (!indexed.nodesById.has(query.destinationId)) {
    throw new Error(`Unknown destinationId: ${query.destinationId}`);
  }

  if (query.originId === query.destinationId) {
    const node = indexed.nodesById.get(query.originId)!;
    return {
      found: true,
      nodeIds: [query.originId],
      edgeIds: [],
      distanceMeters: 0,
      geometry: [node.coordinates],
    };
  }

  const goal = indexed.nodesById.get(query.destinationId)!;
  const open = new Set<NodeId>([query.originId]);
  const closed = new Set<NodeId>();
  const state = new Map<NodeId, Tentative>();

  state.set(query.originId, {
    distance: 0,
    viaEdgeId: null,
    prevNodeId: null,
  });

  while (open.size > 0) {
    let currentId: NodeId | null = null;
    let bestF = Infinity;

    for (const id of open) {
      const g = state.get(id)?.distance ?? Infinity;
      const node = indexed.nodesById.get(id)!;
      const f = g + heuristic(node.coordinates, goal.coordinates);
      if (f < bestF) {
        bestF = f;
        currentId = id;
      }
    }

    if (currentId === null) {
      break;
    }

    if (currentId === query.destinationId) {
      return reconstruct(indexed, state, query.originId, query.destinationId);
    }

    open.delete(currentId);
    closed.add(currentId);

    const currentG = state.get(currentId)!.distance;
    const neighbors = indexed.adjacency.get(currentId) ?? [];

    for (const { to, edge } of neighbors) {
      if (closed.has(to)) {
        continue;
      }
      if (requireAccessible && !edge.wheelchairAccessible) {
        continue;
      }

      const tentativeG = currentG + edge.lengthMeters;
      const prior = state.get(to);
      if (prior && tentativeG >= prior.distance) {
        continue;
      }

      state.set(to, {
        distance: tentativeG,
        viaEdgeId: edge.id,
        prevNodeId: currentId,
      });
      open.add(to);
    }
  }

  return {
    found: false,
    nodeIds: [],
    edgeIds: [],
    distanceMeters: null,
    geometry: [],
  };
}

function reconstruct(
  indexed: ReturnType<typeof indexGraph>,
  state: Map<NodeId, Tentative>,
  originId: NodeId,
  destinationId: NodeId,
): RouteResult {
  const nodeIds: NodeId[] = [];
  const edgeIds: EdgeId[] = [];
  let cursor: NodeId | null = destinationId;

  while (cursor !== null) {
    nodeIds.push(cursor);
    const entry = state.get(cursor);
    if (!entry) {
      throw new Error(`Incomplete path state at ${cursor}`);
    }
    if (entry.viaEdgeId) {
      edgeIds.push(entry.viaEdgeId);
    }
    cursor = entry.prevNodeId;
  }

  nodeIds.reverse();
  edgeIds.reverse();

  if (nodeIds[0] !== originId) {
    throw new Error("Path reconstruction failed to reach origin");
  }

  const geometry: Coordinates[] = nodeIds.map((id) => {
    const node = indexed.nodesById.get(id);
    if (!node) {
      throw new Error(`Missing node during geometry build: ${id}`);
    }
    return node.coordinates;
  });

  const distanceMeters = state.get(destinationId)!.distance;

  return {
    found: true,
    nodeIds,
    edgeIds,
    distanceMeters,
    geometry,
  };
}

/** Dijkstra alias: same A* entry with callers who prefer that name. */
export function findShortestPathDijkstra(
  graph: WalkableGraph,
  query: RouteQuery,
): RouteResult {
  return findShortestPath(graph, query);
}
