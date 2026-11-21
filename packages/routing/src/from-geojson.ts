import { RoutingError } from "./errors.ts";
import type { GraphEdge, GraphNode, PedestrianGraph } from "./types.ts";
import { validateGraph } from "./validate.ts";

export const WALKABLE_LAYERS = new Set(["road", "footway", "path", "sidewalk"]);
export const INACCESSIBLE_HIGHWAYS = new Set(["steps"]);
/** Merge vertices closer than this (duplicate OSM nodes / float noise). */
export const VERTEX_MERGE_METERS = 0.5;
/**
 * Merge original line endpoints closer than this so campus ways that miss a
 * shared OSM node still form one walkable network. The Wellesley extract has a
 * 9 m gap between osm-way-543827745 and College Road.
 */
export const ENDPOINT_STITCH_METERS = 10;
const EARTH_RADIUS_METERS = 6_371_000;
const LAT_METERS = 111_320;

export type LonLat = [number, number];

export type WalkableGraphOptions = {
  /** Way ids that start blocked; the intervention later sets accessible true. */
  inaccessibleWayIds?: Iterable<string>;
  vertexMergeMeters?: number;
  endpointStitchMeters?: number;
};

type RawWay = {
  id: string;
  highway: string | undefined;
  coords: LonLat[];
};

type GeoJsonFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown> | null;
};

type GeoJsonFeatureCollection = {
  type?: string;
  features?: GeoJsonFeature[];
};

function asLonLat(value: unknown): LonLat | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = value[0];
  const latitude = value[1];
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

export function haversineMeters(a: LonLat, b: LonLat): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLon = toRad(b[0] - a[0]);
  const dLat = toRad(b[1] - a[1]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function wayIdFromEdgeId(edgeId: string): string {
  const index = edgeId.indexOf(":");
  return index === -1 ? edgeId : edgeId.slice(0, index);
}

export function edgeBelongsToWay(edgeId: string, wayId: string): boolean {
  return edgeId === wayId || edgeId.startsWith(`${wayId}:`);
}

function pointKey(point: LonLat): string {
  return `${point[0]},${point[1]}`;
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent !== id) {
      const root = this.find(parent);
      this.parent.set(id, root);
      return root;
    }
    this.parent.set(id, id);
    return id;
  }

  union(a: string, b: string): void {
    const left = this.find(a);
    const right = this.find(b);
    if (left !== right) this.parent.set(right, left);
  }
}

function clusterKeys(
  keys: readonly string[],
  coords: Map<string, LonLat>,
  mergeMeters: number,
): UnionFind {
  const unionFind = new UnionFind();
  if (mergeMeters <= 0) {
    for (const key of keys) unionFind.find(key);
    return unionFind;
  }

  const lonScale = LAT_METERS * Math.cos((42.293 * Math.PI) / 180);
  const cell = Math.max(mergeMeters, 0.25);
  const buckets = new Map<string, string[]>();
  for (const key of keys) {
    const point = coords.get(key);
    if (!point) continue;
    const i = Math.round((point[0] * lonScale) / cell);
    const j = Math.round((point[1] * LAT_METERS) / cell);
    const bucket = `${i},${j}`;
    const list = buckets.get(bucket);
    if (list) list.push(key);
    else buckets.set(bucket, [key]);
  }

  for (const key of keys) {
    const point = coords.get(key);
    if (!point) continue;
    const i0 = Math.round((point[0] * lonScale) / cell);
    const j0 = Math.round((point[1] * LAT_METERS) / cell);
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        for (const other of buckets.get(`${i0 + di},${j0 + dj}`) ?? []) {
          if (other <= key) continue;
          const otherPoint = coords.get(other);
          if (!otherPoint) continue;
          if (haversineMeters(point, otherPoint) <= mergeMeters) {
            unionFind.union(key, other);
          }
        }
      }
    }
  }
  return unionFind;
}

function averages(
  keys: readonly string[],
  coords: Map<string, LonLat>,
  unionFind: UnionFind,
): Map<string, LonLat> {
  const groups = new Map<string, LonLat[]>();
  for (const key of keys) {
    const point = coords.get(key);
    if (!point) continue;
    const root = unionFind.find(key);
    const list = groups.get(root);
    if (list) list.push(point);
    else groups.set(root, [point]);
  }
  const canon = new Map<string, LonLat>();
  for (const [root, points] of groups) {
    const lon = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const average: LonLat = [lon, lat];
    for (const key of keys) {
      if (unionFind.find(key) === root) canon.set(key, average);
    }
  }
  return canon;
}

function segmentIntersection(
  a: LonLat,
  b: LonLat,
  c: LonLat,
  d: LonLat,
): LonLat | null {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const dcx = d[0] - c[0];
  const dcy = d[1] - c[1];
  const den = bax * dcy - bay * dcx;
  if (den === 0) return null;
  const cax = c[0] - a[0];
  const cay = c[1] - a[1];
  const t = (cax * dcy - cay * dcx) / den;
  const u = (cax * bay - cay * bax) / den;
  const eps = 1e-12;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return [a[0] + t * bax, a[1] + t * bay];
}

function parseWays(collection: GeoJsonFeatureCollection): RawWay[] {
  if (!collection || !Array.isArray(collection.features)) {
    throw new RoutingError("Basemap must be a GeoJSON FeatureCollection.");
  }

  const ways: RawWay[] = [];
  const seen = new Set<string>();
  for (const feature of collection.features) {
    const properties = feature.properties ?? {};
    const layer = properties.layer;
    if (typeof layer !== "string" || !WALKABLE_LAYERS.has(layer)) continue;
    if (feature.geometry?.type !== "LineString") continue;
    const edgeId = properties.edgeId;
    if (typeof edgeId !== "string" || edgeId.length === 0) {
      throw new RoutingError("Every walkable line needs properties.edgeId.");
    }
    if (seen.has(edgeId)) {
      throw new RoutingError(`Duplicate edge: ${edgeId}`);
    }
    seen.add(edgeId);
    const raw = feature.geometry.coordinates;
    if (!Array.isArray(raw) || raw.length < 2) {
      throw new RoutingError(`Way ${edgeId} needs a LineString with two positions.`);
    }
    const coords: LonLat[] = [];
    for (const position of raw) {
      const point = asLonLat(position);
      if (!point) {
        throw new RoutingError(`Way ${edgeId} has an invalid coordinate.`);
      }
      coords.push(point);
    }
    const highway = properties.highway;
    ways.push({
      id: edgeId,
      highway: typeof highway === "string" ? highway : undefined,
      coords,
    });
  }
  if (ways.length === 0) {
    throw new RoutingError("Basemap has no walkable line features.");
  }
  return ways;
}

function splitAtCrossings(ways: RawWay[]): RawWay[] {
  const extras: LonLat[][][] = ways.map((way) =>
    Array.from({ length: Math.max(0, way.coords.length - 1) }, () => []),
  );

  for (let i = 0; i < ways.length; i += 1) {
    const left = ways[i];
    if (!left) continue;
    for (let si = 0; si < left.coords.length - 1; si += 1) {
      const a = left.coords[si];
      const b = left.coords[si + 1];
      if (!a || !b) continue;
      for (let j = i + 1; j < ways.length; j += 1) {
        const right = ways[j];
        if (!right) continue;
        for (let sj = 0; sj < right.coords.length - 1; sj += 1) {
          const c = right.coords[sj];
          const d = right.coords[sj + 1];
          if (!c || !d) continue;
          const point = segmentIntersection(a, b, c, d);
          if (!point) continue;
          extras[i]?.[si]?.push(point);
          extras[j]?.[sj]?.push(point);
        }
      }
    }
  }

  return ways.map((way, wayIndex) => {
    const coords: LonLat[] = [];
    const first = way.coords[0];
    if (first) coords.push(first);
    for (let i = 0; i < way.coords.length - 1; i += 1) {
      const start = way.coords[i];
      const end = way.coords[i + 1];
      if (!start || !end) continue;
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const inserted = [...(extras[wayIndex]?.[i] ?? [])].sort(
        (left, right) =>
          (left[0] - start[0]) * dx +
          (left[1] - start[1]) * dy -
          ((right[0] - start[0]) * dx + (right[1] - start[1]) * dy),
      );
      for (const point of inserted) coords.push(point);
      coords.push(end);
    }
    return { ...way, coords };
  });
}

/**
 * Directed pedestrian graph from a Wellesley (or other) GeoJSON extract.
 * Does not fetch OpenStreetMap. Buildings are ignored. Steps stay inaccessible.
 */
export function fromWalkableGeoJSON(
  collection: unknown,
  options: WalkableGraphOptions = {},
): PedestrianGraph {
  const ways = splitAtCrossings(parseWays(collection as GeoJsonFeatureCollection));
  const blocked = new Set(options.inaccessibleWayIds ?? []);
  const vertexMerge = options.vertexMergeMeters ?? VERTEX_MERGE_METERS;
  const stitch = options.endpointStitchMeters ?? ENDPOINT_STITCH_METERS;

  const coords = new Map<string, LonLat>();
  const endpointKeys: string[] = [];
  const waysByEndpoint = new Map<string, Set<string>>();
  for (const way of ways) {
    const start = way.coords[0];
    const end = way.coords[way.coords.length - 1];
    const ends = [start, end];
    for (const point of ends) {
      if (!point) continue;
      const key = pointKey(point);
      endpointKeys.push(key);
      const owners = waysByEndpoint.get(key);
      if (owners) owners.add(way.id);
      else waysByEndpoint.set(key, new Set([way.id]));
    }
    for (const point of way.coords) coords.set(pointKey(point), point);
  }
  const keys = [...coords.keys()];
  const unionFind = clusterKeys(keys, coords, vertexMerge);
  let canon = averages(keys, coords, unionFind);

  if (stitch > 0) {
    const endUnion = new UnionFind();
    const uniqueEnds = [...new Set(endpointKeys)];
    for (let i = 0; i < uniqueEnds.length; i += 1) {
      const leftKey = uniqueEnds[i];
      if (!leftKey) continue;
      const left = canon.get(leftKey);
      if (!left) continue;
      for (let j = i + 1; j < uniqueEnds.length; j += 1) {
        const rightKey = uniqueEnds[j];
        if (!rightKey) continue;
        const right = canon.get(rightKey);
        if (!right) continue;
        const leftWays = waysByEndpoint.get(leftKey);
        const rightWays = waysByEndpoint.get(rightKey);
        const sameWayOnly =
          leftWays !== undefined &&
          rightWays !== undefined &&
          leftWays.size === 1 &&
          rightWays.size === 1 &&
          [...leftWays][0] === [...rightWays][0];
        if (sameWayOnly) continue;
        if (haversineMeters(left, right) <= stitch) {
          endUnion.union(leftKey, rightKey);
        }
      }
    }
    const remap = new Map<string, LonLat>();
    const groups = new Map<string, LonLat[]>();
    for (const key of uniqueEnds) {
      const point = canon.get(key);
      if (!point) continue;
      const root = endUnion.find(key);
      const list = groups.get(root);
      if (list) list.push(point);
      else groups.set(root, [point]);
    }
    for (const [root, points] of groups) {
      const lon = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
      remap.set(root, [lon, lat]);
    }
    const stitched = new Map<string, LonLat>();
    const endRootByCanon = new Map<string, string>();
    for (const key of uniqueEnds) {
      const point = canon.get(key);
      if (!point) continue;
      endRootByCanon.set(pointKey(point), endUnion.find(key));
    }
    for (const [key, point] of canon) {
      const root = endRootByCanon.get(pointKey(point));
      stitched.set(key, root ? (remap.get(root) ?? point) : point);
    }
    canon = stitched;
  }

  const nodeByCoord = new Map<string, string>();
  const nodes: GraphNode[] = [];
  const uniqueCanon = new Map<string, LonLat>();
  for (const point of canon.values()) uniqueCanon.set(pointKey(point), point);
  const sorted = [...uniqueCanon.values()].sort(
    (left, right) => left[0] - right[0] || left[1] - right[1],
  );
  for (const [index, point] of sorted.entries()) {
    const id = `n${index}`;
    nodeByCoord.set(pointKey(point), id);
    nodes.push({ id, coordinates: [point[0], point[1]] });
  }

  const edges: GraphEdge[] = [];
  const usedIds = new Set<string>();
  const sortedWays = [...ways].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (const way of sortedWays) {
    const accessible =
      !blocked.has(way.id) &&
      !(way.highway !== undefined && INACCESSIBLE_HIGHWAYS.has(way.highway));
    let segment = 0;
    for (let i = 0; i < way.coords.length - 1; i += 1) {
      const start = way.coords[i];
      const end = way.coords[i + 1];
      if (!start || !end) continue;
      const fromPoint = canon.get(pointKey(start));
      const toPoint = canon.get(pointKey(end));
      if (!fromPoint || !toPoint) continue;
      const from = nodeByCoord.get(pointKey(fromPoint));
      const to = nodeByCoord.get(pointKey(toPoint));
      if (!from || !to || from === to) continue;
      const lengthMeters = haversineMeters(fromPoint, toPoint);
      const forwardId = `${way.id}:${segment}`;
      const reverseId = `${way.id}:${segment}:reverse`;
      if (usedIds.has(forwardId) || usedIds.has(reverseId)) {
        throw new RoutingError(`Duplicate edge: ${forwardId}`);
      }
      usedIds.add(forwardId);
      usedIds.add(reverseId);
      edges.push({
        id: forwardId,
        from,
        to,
        lengthMeters,
        accessible,
      });
      edges.push({
        id: reverseId,
        from: to,
        to: from,
        lengthMeters,
        accessible,
      });
      segment += 1;
    }
  }

  const graph: PedestrianGraph = { nodes, edges };
  validateGraph(graph);
  return graph;
}
