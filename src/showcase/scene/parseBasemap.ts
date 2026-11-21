import { isFeatureCollection, type SceneProjector } from "../geo";

export type BasemapLayer = "building" | "road" | "footway" | "path" | "sidewalk";

export type BuildingFootprint = {
  id: string;
  edgeId?: string;
  name?: string;
  /** Closed ring in local [x, z]. */
  ring: readonly (readonly [number, number])[];
  height: number;
};

export type WayRibbon = {
  id: string;
  edgeId?: string;
  layer: Exclude<BasemapLayer, "building">;
  name?: string;
  points: readonly (readonly [number, number])[];
  halfWidth: number;
};

export type ParsedBasemap = {
  buildings: BuildingFootprint[];
  ways: WayRibbon[];
};

const BUILDING_HEIGHTS: Record<string, number> = {
  dormitory: 2.4,
  college: 2.1,
  university: 2.6,
  chapel: 2.8,
  apartments: 3.2,
  industrial: 1.6,
  yes: 1.9,
};

function asLonLat(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

function projectRing(
  coords: unknown[],
  project: SceneProjector["project"],
): (readonly [number, number])[] {
  const ring: (readonly [number, number])[] = [];
  for (const pair of coords) {
    const ll = asLonLat(pair);
    if (!ll) continue;
    const next = project(ll[0], ll[1]);
    const prev = ring[ring.length - 1];
    if (prev && prev[0] === next[0] && prev[1] === next[1]) continue;
    ring.push(next);
  }
  if (
    ring.length >= 2 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  ) {
    ring.pop();
  }
  return ring;
}

function projectLine(
  coords: unknown[],
  project: SceneProjector["project"],
): (readonly [number, number])[] {
  return projectRing(coords, project);
}

function layerOf(properties: Record<string, unknown> | null): BasemapLayer | null {
  const layer = properties?.layer;
  if (
    layer === "building" ||
    layer === "road" ||
    layer === "footway" ||
    layer === "path" ||
    layer === "sidewalk"
  ) {
    return layer;
  }
  return null;
}

function wayHalfWidth(layer: Exclude<BasemapLayer, "building">): number {
  switch (layer) {
    case "road":
      return 0.28;
    case "sidewalk":
      return 0.12;
    case "footway":
      return 0.1;
    case "path":
      return 0.09;
  }
}

function buildingHeight(properties: Record<string, unknown> | null): number {
  const kind = String(properties?.building ?? "yes");
  return BUILDING_HEIGHTS[kind] ?? 1.9;
}

/**
 * Turn Ashsmith's Wellesley FeatureCollection into local miniature footprints.
 */
export function parseBasemap(
  geoJson: unknown,
  projector: SceneProjector,
): ParsedBasemap | null {
  if (!isFeatureCollection(geoJson)) return null;

  const buildings: BuildingFootprint[] = [];
  const ways: WayRibbon[] = [];

  for (const feature of geoJson.features) {
    if (typeof feature !== "object" || feature === null) continue;
    const f = feature as {
      id?: string | number;
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown> | null;
    };
    const layer = layerOf(f.properties ?? null);
    if (!layer || !f.geometry?.type || f.geometry.coordinates == null) continue;

    const id = String(f.id ?? f.properties?.osmId ?? `${layer}-${buildings.length + ways.length}`);
    const edgeId =
      typeof f.properties?.edgeId === "string" ? f.properties.edgeId : undefined;
    const name = typeof f.properties?.name === "string" ? f.properties.name : undefined;

    if (layer === "building" && f.geometry.type === "Polygon") {
      const rings = f.geometry.coordinates as unknown[];
      if (!Array.isArray(rings) || !Array.isArray(rings[0])) continue;
      const ring = projectRing(rings[0] as unknown[], projector.project);
      if (ring.length < 3) continue;
      buildings.push({
        id,
        edgeId,
        name,
        ring,
        height: buildingHeight(f.properties ?? null),
      });
      continue;
    }

    if (
      layer !== "building" &&
      f.geometry.type === "LineString" &&
      Array.isArray(f.geometry.coordinates)
    ) {
      const points = projectLine(f.geometry.coordinates as unknown[], projector.project);
      if (points.length < 2) continue;
      ways.push({
        id,
        edgeId,
        layer,
        name,
        points,
        halfWidth: wayHalfWidth(layer),
      });
    }
  }

  if (buildings.length === 0 && ways.length === 0) return null;
  return { buildings, ways };
}
