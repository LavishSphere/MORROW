/**
 * @morrow/routing — pure pedestrian routing for MORROW.
 *
 * Usable from:
 * - Browser Compare / Improve preview
 * - Future POST /api/proposals/generate (recompute before Gemini)
 */

export {
  DEFAULT_MODEL_ASSUMPTIONS,
  mergeAssumptions,
} from "./assumptions.js";

export {
  applyGraphChanges,
  indexGraph,
  sumEdgeLengths,
  type IndexedGraph,
} from "./graph.js";

export {
  compareBeforeAfter,
  compareScenario,
  toModeledRouteMetrics,
  type CompareInput,
} from "./compare.js";

export {
  findShortestPath,
  findShortestPathDijkstra,
} from "./pathfinding.js";

export {
  graphFromWalkableGeoJson,
  type GeoJsonFeature,
  type GeoJsonFeatureCollection,
  type GeoJsonLineString,
  type GeoJsonPoint,
  type GeoJsonPosition,
  type WalkableEdgeProperties,
  type WalkableGeoJsonInput,
  type WalkableNodeProperties,
} from "./geojson.js";

export {
  SYNTHETIC_BARRIER_ID,
  SYNTHETIC_BLOCKED_EDGE_ID,
  SYNTHETIC_EXPECTED,
  SYNTHETIC_INTERVENTION_ID,
  SYNTHETIC_SCENARIO_ID,
  syntheticDemoScenario,
} from "./fixtures/synthetic-demo.js";

export type {
  Coordinates,
  EdgeId,
  GraphChange,
  GraphEdge,
  GraphNode,
  ModeledComparison,
  ModeledRouteMetrics,
  NodeId,
  PedestrianScenario,
  RouteNotFound,
  RoutePath,
  RouteQuery,
  RouteResult,
  WalkableGraph,
} from "./types.js";
