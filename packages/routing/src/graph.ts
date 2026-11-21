import type {
  EdgeId,
  GraphChange,
  GraphEdge,
  GraphNode,
  NodeId,
  WalkableGraph,
} from "./types.js";

export type IndexedGraph = {
  nodesById: ReadonlyMap<NodeId, GraphNode>;
  edgesById: ReadonlyMap<EdgeId, GraphEdge>;
  /** Outgoing undirected links: neighbor + edge used. */
  adjacency: ReadonlyMap<
    NodeId,
    readonly { to: NodeId; edge: GraphEdge }[]
  >;
};

export function indexGraph(graph: WalkableGraph): IndexedGraph {
  const nodesById = new Map<NodeId, GraphNode>();
  for (const node of graph.nodes) {
    if (nodesById.has(node.id)) {
      throw new Error(`Duplicate node id: ${node.id}`);
    }
    nodesById.set(node.id, node);
  }

  const edgesById = new Map<EdgeId, GraphEdge>();
  const adjacencyBuilder = new Map<NodeId, { to: NodeId; edge: GraphEdge }[]>();

  const ensureAdj = (id: NodeId) => {
    if (!adjacencyBuilder.has(id)) {
      adjacencyBuilder.set(id, []);
    }
    return adjacencyBuilder.get(id)!;
  };

  for (const edge of graph.edges) {
    if (edgesById.has(edge.id)) {
      throw new Error(`Duplicate edge id: ${edge.id}`);
    }
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) {
      throw new Error(
        `Edge ${edge.id} references missing node(s): ${edge.from} → ${edge.to}`,
      );
    }
    if (!(edge.lengthMeters > 0) || !Number.isFinite(edge.lengthMeters)) {
      throw new Error(`Edge ${edge.id} must have a finite positive lengthMeters`);
    }
    edgesById.set(edge.id, edge);

    const bidirectional = edge.bidirectional !== false;
    ensureAdj(edge.from).push({ to: edge.to, edge });
    if (bidirectional) {
      ensureAdj(edge.to).push({ to: edge.from, edge });
    }
  }

  for (const node of graph.nodes) {
    ensureAdj(node.id);
  }

  return {
    nodesById,
    edgesById,
    adjacency: adjacencyBuilder,
  };
}

/**
 * Apply Intervention.graphChanges immutably.
 * Unknown edge ids throw so generate cannot silently ignore bad interventions.
 */
export function applyGraphChanges(
  graph: WalkableGraph,
  changes: readonly GraphChange[],
): WalkableGraph {
  if (changes.length === 0) {
    return graph;
  }

  const byId = new Map(graph.edges.map((e) => [e.id, e] as const));
  for (const change of changes) {
    const existing = byId.get(change.edgeId);
    if (!existing) {
      throw new Error(`graphChanges references unknown edgeId: ${change.edgeId}`);
    }
    const next: GraphEdge = {
      ...existing,
      wheelchairAccessible: change.accessible,
      ...(change.weight !== undefined
        ? { lengthMeters: change.weight }
        : {}),
    };
    if (!(next.lengthMeters > 0) || !Number.isFinite(next.lengthMeters)) {
      throw new Error(
        `graphChanges for ${change.edgeId} produced invalid lengthMeters`,
      );
    }
    byId.set(change.edgeId, next);
  }

  return {
    nodes: graph.nodes,
    edges: graph.edges.map((e) => byId.get(e.id) ?? e),
  };
}

export function sumEdgeLengths(
  graph: WalkableGraph,
  edgeIds: readonly EdgeId[],
): number {
  const byId = new Map(graph.edges.map((e) => [e.id, e] as const));
  let total = 0;
  for (const id of edgeIds) {
    const edge = byId.get(id);
    if (!edge) {
      throw new Error(`Unknown edge in path: ${id}`);
    }
    total += edge.lengthMeters;
  }
  return total;
}
