/**
 * Building height for the glass city.
 *
 * Overture release 2026-11-18.0 height, unless that height was supplied by
 * Microsoft ML Buildings (those downtown values top out near 35 m). Then the
 * OpenStreetMap `height` tag. Then `building:levels` or Overture `num_floors`
 * times 3 m. Nothing is invented from the building type. A footprint with
 * none of those still draws: at its Microsoft imagery height if it has one,
 * otherwise at a plain two-story default, so buildings never vanish.
 */

export const OVERTURE_RELEASE = "2026-11-18.0";
export const METRES_PER_LEVEL = 3;

/**
 * Footprints with no measured height and no floor count are still drawn,
 * at this plain two-story height, so a neighborhood never loses its houses.
 */
export const DEFAULT_HEIGHT_METRES = 2 * METRES_PER_LEVEL;

export type HeightKind = "measured" | "levels×3" | "estimated" | "default";

export type HeightSource = {
  property?: string | null;
  dataset?: string | null;
  record_id?: string | null;
};

export type ResolvedHeight = {
  meters: number;
  kind: HeightKind;
};

export type OvertureFootprint = {
  id: string;
  /** Outer ring, [longitude, latitude], closed. */
  ring: [number, number][];
  height: number | null;
  numFloors: number | null;
  roofShape: string | null;
  roofHeight: number | null;
  minHeight: number | null;
  sources: HeightSource[];
  /** OpenStreetMap way id when the feature cites one. */
  osmId: number | null;
  /** OpenStreetMap relation id when the feature cites a multipolygon relation instead. */
  osmRelationId?: number | null;
};

type OsmProps = Record<string, unknown>;

function positive(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function isMicrosoftDataset(dataset: string | null | undefined): boolean {
  return typeof dataset === "string" && /microsoft/i.test(dataset);
}

/** Dataset that supplied `height`, or the feature dataset when height has no source of its own. */
export function heightDataset(sources: readonly HeightSource[]): string | null {
  for (const source of sources) {
    const property = (source.property ?? "").replace(/^\//, "");
    if (property === "properties/height" && source.dataset) return source.dataset;
  }
  const whole = sources.find((source) => (source.property ?? "") === "");
  return whole?.dataset ?? null;
}

function osmRecordId(sources: readonly HeightSource[], prefix: "w" | "r"): number | null {
  const pattern = prefix === "w" ? /^w(\d+)/ : /^r(\d+)/;
  for (const source of sources) {
    const match = pattern.exec(source.record_id ?? "");
    if (match) return Number(match[1]);
  }
  return null;
}

export function osmWayId(sources: readonly HeightSource[]): number | null {
  return osmRecordId(sources, "w");
}

/** OpenStreetMap relation id, for buildings mapped as multipolygons (`r7261820@17`). */
export function osmRelationId(sources: readonly HeightSource[]): number | null {
  return osmRecordId(sources, "r");
}

/**
 * Key for matching OSM shapes: `w<id>` for a way, `r<id>` for a relation.
 * Ways and relations reuse the same numbers, so the type is part of the key.
 * Anything else (an Overture id) has no OSM key.
 */
function osmKey(osmId: unknown): string | null {
  if (typeof osmId === "number" && Number.isInteger(osmId) && osmId > 0) return `w${osmId}`;
  if (typeof osmId !== "string") return null;
  if (/^\d+$/.test(osmId)) return `w${Number(osmId)}`;
  return /^r\d+$/.test(osmId) ? osmId : null;
}

function footprintKey(footprint: OvertureFootprint): string | null {
  if (footprint.osmId != null) return `w${footprint.osmId}`;
  if (footprint.osmRelationId != null) return `r${footprint.osmRelationId}`;
  return null;
}

/**
 * Metres to extrude, or null when no measured height and no floor count exist.
 * A Microsoft imagery height is treated as missing.
 */
export function resolveBuildingHeight(input: {
  overtureHeight?: unknown;
  sources?: readonly HeightSource[];
  osmHeight?: unknown;
  osmLevels?: unknown;
  numFloors?: unknown;
}): ResolvedHeight | null {
  const sources = input.sources ?? [];
  const overture = positive(input.overtureHeight);
  if (overture != null && !isMicrosoftDataset(heightDataset(sources))) {
    return { meters: overture, kind: "measured" };
  }
  const osm = positive(input.osmHeight);
  if (osm != null) return { meters: osm, kind: "measured" };
  const levels = positive(input.osmLevels) ?? positive(input.numFloors);
  if (levels != null) return { meters: levels * METRES_PER_LEVEL, kind: "levels×3" };
  return null;
}

/**
 * Metres to extrude for any footprint. The measured cascade first; then a
 * Microsoft imagery height (low downtown, but right for houses); then the
 * plain default. Never null, so no footprint disappears.
 */
export function buildingHeightOrFallback(input: Parameters<typeof resolveBuildingHeight>[0]): ResolvedHeight {
  const resolved = resolveBuildingHeight(input);
  if (resolved) return resolved;
  const imagery = positive(input.overtureHeight);
  if (imagery != null) return { meters: imagery, kind: "estimated" };
  return { meters: DEFAULT_HEIGHT_METRES, kind: "default" };
}

/** A roof is drawn only when a source recorded a non-flat shape. */
export function recordedRoofShape(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const shape = candidate.trim().toLowerCase();
    if (shape && shape !== "flat") return shape;
  }
  return null;
}

type GeoFeature = {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: OsmProps | null;
};

function isCollection(value: unknown): value is { type: string; features: GeoFeature[]; center?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown }).features)
  );
}

function closeRing(ring: readonly (readonly [number, number])[]): [number, number][] {
  const points = ring.map(([lon, lat]) => [lon, lat] as [number, number]);
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) points.push([first[0], first[1]]);
  return points;
}

function buildingFeature(
  ring: readonly (readonly [number, number])[],
  properties: OsmProps,
): GeoFeature {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [closeRing(ring)] },
    properties,
  };
}

/**
 * Replace building footprints with the Overture extract. Streets, water, and
 * other layers are left as they were. Every footprint is kept: one with no
 * measured height or floor count gets an imagery estimate or the default.
 */
export function withOvertureBuildings(geoJson: unknown, footprints: readonly OvertureFootprint[]): unknown {
  if (!isCollection(geoJson)) return geoJson;
  const kept = geoJson.features.filter((feature) => feature.properties?.layer !== "building");
  const osmBuildings = geoJson.features.filter((feature) => feature.properties?.layer === "building");
  const osmById = new Map<string, GeoFeature>();
  for (const feature of osmBuildings) {
    const key = osmKey(feature.properties?.osmId);
    if (key != null) osmById.set(key, feature);
  }

  const buildings: GeoFeature[] = [];
  const used = new Set<string>();
  for (const footprint of footprints) {
    if (footprint.ring.length < 4) continue;
    const key = footprintKey(footprint);
    const osm = key != null ? osmById.get(key) : undefined;
    if (key != null) used.add(key);
    const props = osm?.properties ?? {};
    const resolved = buildingHeightOrFallback({
      overtureHeight: footprint.height,
      sources: footprint.sources,
      osmHeight: props.height,
      osmLevels: props["building:levels"],
      numFloors: footprint.numFloors,
    });
    const roof = recordedRoofShape(footprint.roofShape, props["roof:shape"]);
    const minHeight = positive(footprint.minHeight) ?? positive(props.min_height);
    buildings.push(
      buildingFeature(footprint.ring, {
        // Same id the OSM shape had, so the city's tag lookup still finds it.
        osmId: footprint.osmId ?? (footprint.osmRelationId != null ? `r${footprint.osmRelationId}` : footprint.id),
        layer: "building",
        name: typeof props.name === "string" ? props.name : undefined,
        building: typeof props.building === "string" ? props.building : "yes",
        height: resolved.meters,
        height_kind: resolved.kind,
        source: "Overture Maps",
        source_date: OVERTURE_RELEASE,
        ...(roof ? { "roof:shape": roof } : {}),
        ...(positive(footprint.roofHeight) != null ? { "roof:height": footprint.roofHeight } : {}),
        ...(minHeight != null ? { min_height: minHeight } : {}),
      }),
    );
  }

  // An OSM building the extract did not return keeps its own height, levels, or the default.
  for (const feature of osmBuildings) {
    const key = osmKey(feature.properties?.osmId);
    if (key != null && used.has(key)) continue;
    if (!feature.geometry || !Array.isArray(feature.geometry.coordinates)) continue;
    const props = feature.properties ?? {};
    const resolved = buildingHeightOrFallback({
      osmHeight: props.height,
      osmLevels: props["building:levels"],
    });
    const roof = recordedRoofShape(props["roof:shape"]);
    buildings.push({
      ...feature,
      properties: {
        ...props,
        height: resolved.meters,
        height_kind: resolved.kind,
        "roof:shape": roof ?? undefined,
      },
    });
  }

  return { ...geoJson, features: [...kept, ...buildings] };
}
