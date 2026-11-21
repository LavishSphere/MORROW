/**
 * Shared routing types for browser preview and server generate.
 * Aligns with MORROW Intervention.graphChanges and ProposalFacts metrics.
 */

export type NodeId = string;
export type EdgeId = string;

/** Lon/lat in WGS84, or planar meters for synthetic fixtures. */
export type Coordinates = readonly [number, number];

export type GraphNode = {
  id: NodeId;
  /** [lon, lat] for geographic graphs; [x, y] meters for synthetic demos. */
  coordinates: Coordinates;
  label?: string;
};

export type GraphEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  /** Traversal cost in meters (edge length). */
  lengthMeters: number;
  /** When false, edge is excluded from wheelchair-accessible routing. */
  wheelchairAccessible: boolean;
  /** Default true: undirected walk link. */
  bidirectional?: boolean;
};

export type WalkableGraph = {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
};

/**
 * Matches Intervention.graphChanges from the project plan.
 * `weight` overrides lengthMeters when provided.
 */
export type GraphChange = {
  edgeId: EdgeId;
  accessible: boolean;
  weight?: number;
};

export type RouteQuery = {
  originId: NodeId;
  destinationId: NodeId;
  /** Default true for MORROW accessibility scenarios. */
  requireWheelchairAccessible?: boolean;
};

export type RoutePath = {
  found: true;
  nodeIds: NodeId[];
  edgeIds: EdgeId[];
  distanceMeters: number;
  /** Coordinate sequence for map/3D route light. */
  geometry: Coordinates[];
};

export type RouteNotFound = {
  found: false;
  nodeIds: [];
  edgeIds: [];
  distanceMeters: null;
  geometry: [];
};

export type RouteResult = RoutePath | RouteNotFound;

export type ModeledComparison = {
  before: RouteResult;
  after: RouteResult;
  /** after − before when both found; negative means shorter after. */
  deltaMeters: number | null;
  /** Honest labels for proposals and UI. */
  modelAssumptions: readonly string[];
  scenarioId: string;
  interventionId: string;
};

/**
 * Subset of ProposalFacts the routing module can fill.
 * Evidence labels and city copy remain data-seat concerns.
 */
export type ModeledRouteMetrics = {
  beforeMeters: number | null;
  afterMeters: number | null;
  newlyReachableDestinations: number | null;
  modelAssumptions: readonly string[];
  unit: "meters";
};

export type PedestrianScenario = {
  id: string;
  label: string;
  originId: NodeId;
  destinationId: NodeId;
  barrierId: string;
  interventionId: string;
  /** Evidence status is owned by data; routing only carries it through. */
  evidenceStatus: "verified" | "community_reported" | "illustrative";
  graph: WalkableGraph;
  graphChanges: readonly GraphChange[];
  assumptions?: readonly string[];
};
