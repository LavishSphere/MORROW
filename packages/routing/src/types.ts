export type GraphNode = {
  id: string;
  /** [longitude, latitude] when the node is geographic. */
  coordinates?: [number, number];
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  /** Geometric length reported as modeled distance. */
  lengthMeters: number;
  accessible: boolean;
  /**
   * Search cost. Defaults to lengthMeters.
   * Distance reported to callers is always the sum of lengthMeters.
   */
  weight?: number;
};

export type PedestrianGraph = {
  nodes: GraphNode[];
  /** Directed walkable edges. Add a reverse edge when the street is two-way. */
  edges: GraphEdge[];
};

export type RouteQuery = {
  originId: string;
  destinationId: string;
  /** When true, edges marked inaccessible are not traversable. */
  requireAccessible: boolean;
};

export type RoutePath = {
  reachable: boolean;
  distanceMeters: number | null;
  nodeIds: string[];
  edgeIds: string[];
  /**
   * Coordinates along the path. Empty when the path is unreachable or any
   * node on the path has no coordinates.
   */
  geometry: Array<[number, number]>;
};

/** One edge edit from an intervention. Unknown edge ids are rejected. */
export type GraphChange = {
  edgeId: string;
  accessible: boolean;
  weight?: number;
};

export type RouteComparison = {
  before: RoutePath;
  after: RoutePath;
  beforeMeters: number | null;
  afterMeters: number | null;
  /** afterMeters - beforeMeters when both trips are reachable. */
  deltaMeters: number | null;
  becameReachable: boolean;
  assumptions: string[];
};
