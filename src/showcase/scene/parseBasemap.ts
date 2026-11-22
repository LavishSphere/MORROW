import { resolveRoadWidth, type WidthKind } from "../../data/roadWidth.ts";
import { isFeatureCollection, type SceneProjector } from "../geo";
import { isIndoor, onewayOf } from "./trafficLanes.ts";

export type BasemapLayer =
  | "building"
  | "road"
  | "footway"
  | "path"
  | "sidewalk"
  | "water"
  | "waterway"
  | "coastline";

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
  layer: Exclude<BasemapLayer, "building" | "water" | "waterway" | "coastline">;
  name?: string;
  points: readonly (readonly [number, number])[];
  /** Scene units. Half of the resolved carriageway width, scaled into the miniature. */
  halfWidth: number;
  widthMeters: number;
  /** tagged, lanes, or prior. A class fallback is always prior. */
  widthKind: WidthKind;
  /** Meters-per-lane assumption. Set only when widthKind is lanes. */
  metersPerLane: number | null;
  highway: string | null;
  lanes: number | null;
  /** 1 one-way in the drawn direction (or a roundabout), -1 against it, 0 two-way. */
  oneway: 1 | -1 | 0;
  /** Indoor, covered, a tunnel, or on another level: no one is drawn moving here. */
  indoor: boolean;
  /** OSM bridge tag is set (not "no"): the way is an elevated deck. */
  bridge?: boolean;
  /** OSM layer tag (kept as "layer:osm"), 0 when absent: how decks stack. */
  deckLayer?: number;
  /** bridge:structure, ref, and colour, for the big bridges. */
  structure?: string | null;
  ref?: string | null;
  colour?: string | null;
};

/** A mapped lake or pond. The shoreline is the map, not a defect. */
export type WaterBody = {
  id: string;
  name?: string;
  ring: readonly (readonly [number, number])[];
};

/** A mapped river or brook, as a centerline. */
export type Waterway = {
  id: string;
  name?: string;
  points: readonly (readonly [number, number])[];
  wide: boolean;
};

/** OSM coastline. Water is on the right of the directed line. */
export type Coastline = {
  id: string;
  name?: string;
  points: readonly (readonly [number, number])[];
};

export type ParsedBasemap = {
  buildings: BuildingFootprint[];
  ways: WayRibbon[];
  water: WaterBody[];
  waterways: Waterway[];
  coastlines: Coastline[];
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
    layer === "sidewalk" ||
    layer === "water" ||
    layer === "waterway" ||
    layer === "coastline"
  ) {
    return layer;
  }
  return null;
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
  const water: WaterBody[] = [];
  const waterways: Waterway[] = [];
  const coastlines: Coastline[] = [];

  for (const feature of geoJson.features) {
    if (typeof feature !== "object" || feature === null) continue;
    const f = feature as {
      id?: string | number;
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown> | null;
    };
    const layer = layerOf(f.properties ?? null);
    if (!layer || !f.geometry?.type || f.geometry.coordinates == null) continue;

    const id = String(
      f.id ?? f.properties?.osmId ?? `${layer}-${buildings.length + ways.length + water.length}`,
    );
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

    if (layer === "water" && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")) {
      const polygons =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : (f.geometry.coordinates as unknown[]);
      if (!Array.isArray(polygons)) continue;
      polygons.forEach((polygon, index) => {
        if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) return;
        const ring = projectRing(polygon[0] as unknown[], projector.project);
        if (ring.length < 3) return;
        water.push({ id: index === 0 ? id : `${id}:${index}`, name, ring });
      });
      continue;
    }

    if (
      layer === "coastline" &&
      f.geometry.type === "LineString" &&
      Array.isArray(f.geometry.coordinates)
    ) {
      const points = projectLine(f.geometry.coordinates as unknown[], projector.project);
      if (points.length < 2) continue;
      coastlines.push({ id, name, points });
      continue;
    }

    if (
      layer === "waterway" &&
      f.geometry.type === "LineString" &&
      Array.isArray(f.geometry.coordinates)
    ) {
      const points = projectLine(f.geometry.coordinates as unknown[], projector.project);
      if (points.length < 2) continue;
      waterways.push({
        id,
        name,
        points,
        wide: f.properties?.waterway === "river" || f.properties?.waterway === "canal",
      });
      continue;
    }

    if (
      layer !== "building" &&
      layer !== "water" &&
      layer !== "waterway" &&
      layer !== "coastline" &&
      f.geometry.type === "LineString" &&
      Array.isArray(f.geometry.coordinates)
    ) {
      const points = projectLine(f.geometry.coordinates as unknown[], projector.project);
      if (points.length < 2) continue;
      const props = f.properties ?? {};
      // Tunnels run under the buildings; they are not drawn on the ground.
      if (typeof props.tunnel === "string" && props.tunnel !== "no") continue;
      const width = resolveRoadWidth(f.properties ?? null);
      const text = (value: unknown) => (typeof value === "string" && value ? value : null);
      ways.push({
        id,
        edgeId,
        layer,
        name,
        points,
        halfWidth: (width.widthMeters * projector.scale) / 2,
        widthMeters: width.widthMeters,
        widthKind: width.widthKind,
        metersPerLane: width.metersPerLane,
        highway: width.highway,
        lanes: width.lanes,
        oneway: onewayOf(f.properties),
        indoor: isIndoor(f.properties),
        bridge: typeof props.bridge === "string" && props.bridge !== "no",
        deckLayer: Number(props["layer:osm"] ?? 0) || 0,
        structure: text(props["bridge:structure"]),
        ref: text(props.ref),
        colour: text(props.colour),
      });
    }
  }

  if (
    buildings.length === 0 &&
    ways.length === 0 &&
    water.length === 0 &&
    waterways.length === 0 &&
    coastlines.length === 0
  ) {
    return null;
  }
  return { buildings, ways, water, waterways, coastlines };
}
