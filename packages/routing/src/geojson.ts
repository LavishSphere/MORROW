import type { GraphEdge, GraphNode, WalkableGraph } from "./types.js";

/**
 * Minimal GeoJSON types so this package stays dependency-free.
 * Starter-data LineString extracts can plug in later without changing callers.
 */
export type GeoJsonPosition = [number, number] | [number, number, number];

export type GeoJsonLineString = {
  type: "LineString";
  coordinates: GeoJsonPosition[];
};

export type GeoJsonPoint = {
  type: "Point";
  coordinates: GeoJsonPosition;
};

export type WalkableEdgeProperties = {
  edgeId?: string;
  id?: string;
  wheelchairAccessible?: boolean;
  wheelchair?: boolean | "yes" | "no";
  lengthMeters?: number;
  bidirectional?: boolean;
  from?: string;
  to?: string;
};

export type WalkableNodeProperties = {
  nodeId?: string;
  id?: string;
  label?: string;
};

export type GeoJsonFeature<G, P> = {
  type: "Feature";
  geometry: G | null;
  properties: P | null;
  id?: string | number;
};

export type GeoJsonFeatureCollection<G, P> = {
  type: "FeatureCollection";
  features: GeoJsonFeature<G, P>[];
};

export type WalkableGeoJsonInput = {
  /** Optional explicit nodes; otherwise endpoints are synthesized from LineStrings. */
  nodes?: GeoJsonFeatureCollection<GeoJsonPoint, WalkableNodeProperties>;
  edges: GeoJsonFeatureCollection<GeoJsonLineString, WalkableEdgeProperties>;
};

function haversineMeters(a: GeoJsonPosition, b: GeoJsonPosition): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1r = toRad(lat1);
  const lat2r = toRad(lat2);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lineLengthMeters(coords: GeoJsonPosition[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1]!, coords[i]!);
  }
  return total;
}

function coordKey(pos: GeoJsonPosition): string {
  return `${pos[0].toFixed(7)},${pos[1].toFixed(7)}`;
}

function resolveAccessible(
  props: WalkableEdgeProperties | null,
): boolean {
  if (!props) {
    return true;
  }
  if (typeof props.wheelchairAccessible === "boolean") {
    return props.wheelchairAccessible;
  }
  if (props.wheelchair === false || props.wheelchair === "no") {
    return false;
  }
  if (props.wheelchair === true || props.wheelchair === "yes") {
    return true;
  }
  return true;
}

/**
 * Build a WalkableGraph from walkable LineString (+ optional Point) GeoJSON.
 * Designed for Ashsmith's future Wellesley starter extract.
 */
export function graphFromWalkableGeoJson(
  input: WalkableGeoJsonInput,
): WalkableGraph {
  const nodesById = new Map<string, GraphNode>();
  const coordToNodeId = new Map<string, string>();

  const registerNode = (
    id: string,
    coordinates: [number, number],
    label?: string,
  ) => {
    if (!nodesById.has(id)) {
      nodesById.set(id, {
        id,
        coordinates,
        ...(label !== undefined ? { label } : {}),
      });
    }
    coordToNodeId.set(coordKey(coordinates), id);
  };

  if (input.nodes) {
    for (const feature of input.nodes.features) {
      if (!feature.geometry || feature.geometry.type !== "Point") {
        continue;
      }
      const props = feature.properties ?? {};
      const id =
        props.nodeId ??
        props.id ??
        (feature.id !== undefined ? String(feature.id) : undefined);
      if (!id) {
        throw new Error("Node feature is missing nodeId/id");
      }
      const [lon, lat] = feature.geometry.coordinates;
      registerNode(id, [lon, lat], props.label);
    }
  }

  const edges: GraphEdge[] = [];

  for (const [index, feature] of input.edges.features.entries()) {
    if (!feature.geometry || feature.geometry.type !== "LineString") {
      continue;
    }
    const coords = feature.geometry.coordinates;
    if (coords.length < 2) {
      throw new Error(`Edge feature at index ${index} needs ≥2 coordinates`);
    }
    const props = feature.properties ?? {};
    const edgeId =
      props.edgeId ??
      props.id ??
      (feature.id !== undefined ? String(feature.id) : `edge-${index}`);

    const start = coords[0]!;
    const end = coords[coords.length - 1]!;
    const startKey = coordKey(start);
    const endKey = coordKey(end);

    let fromId = props.from ?? coordToNodeId.get(startKey);
    let toId = props.to ?? coordToNodeId.get(endKey);

    if (!fromId) {
      fromId = `n:${startKey}`;
      registerNode(fromId, [start[0], start[1]]);
    }
    if (!toId) {
      toId = `n:${endKey}`;
      registerNode(toId, [end[0], end[1]]);
    }

    const lengthMeters =
      props.lengthMeters !== undefined
        ? props.lengthMeters
        : lineLengthMeters(coords);

    edges.push({
      id: edgeId,
      from: fromId,
      to: toId,
      lengthMeters,
      wheelchairAccessible: resolveAccessible(props),
      ...(props.bidirectional !== undefined
        ? { bidirectional: props.bidirectional }
        : {}),
    });
  }

  return {
    nodes: [...nodesById.values()],
    edges,
  };
}
