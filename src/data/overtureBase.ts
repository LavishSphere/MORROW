/**
 * Streets, paths, rail, and water from Overture Maps (release 2026-11-18.0),
 * for when OpenStreetMap's Overpass servers cannot answer. Overture's files
 * sit on S3: no server to be busy, no rate limit. Overture is built largely
 * from OpenStreetMap, so sidewalks, crosswalks, steps, and surfaces come
 * through; the finer accessibility tags (crossing markings, sidewalk=no) do
 * not, so fewer issues show in a city loaded this way.
 */

import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { filesFor, groupOverlaps, intersects, openParquet, type NeighborhoodBox } from "./overtureBuildings.ts";
import type { OsmWay } from "./overpass.ts";

type Row = Record<string, unknown>;
type Line = [number, number][];

/** Overture road classes are OSM highway values, so they map one to one. */
const ROAD_CLASSES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "living_street",
  "unclassified",
  "service",
  "pedestrian",
  "footway",
  "steps",
  "path",
  "track",
  "cycleway",
  "bridleway",
]);
/** Major classes take an OSM-style _link when Overture says subclass "link". */
const LINKABLE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
/** Overture rail classes the rail layer draws. */
const RAIL_CLASSES = new Set(["standard_gauge", "subway", "light_rail", "tram", "monorail", "narrow_gauge", "funicular"]);
/** Overture water classes drawn as water areas. Pools and fountains are skipped. */
const WATER_CLASSES = new Set(["ocean", "sea", "bay", "lake", "pond", "reservoir", "river", "canal", "stream", "water", "basin", "lagoon"]);
const UNPAVED = new Set(["unpaved", "gravel", "dirt", "ground", "grass", "sand", "compacted", "fine_gravel", "earth", "mud"]);

/** A stable negative number per Overture id, so it never collides with an OSM way id. */
export function overtureNumber(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return -((h >>> 0) + 1);
}

function point(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || typeof value[0] !== "number" || typeof value[1] !== "number") return null;
  return [value[0], value[1]];
}

/** Lines of a GeoJSON LineString or MultiLineString (hyparquet decodes GeoParquet to GeoJSON). */
export function linesOf(geometry: unknown): Line[] {
  const g = geometry as { type?: unknown; coordinates?: unknown } | null;
  if (!g || typeof g !== "object") return [];
  const toLine = (coords: unknown): Line => (Array.isArray(coords) ? coords.map(point).filter((p): p is [number, number] => !!p) : []);
  if (g.type === "LineString") return [toLine(g.coordinates)].filter((l) => l.length >= 2);
  if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) return g.coordinates.map(toLine).filter((l) => l.length >= 2);
  return [];
}

/** Outer rings of a GeoJSON Polygon or MultiPolygon. */
export function outerRingsOf(geometry: unknown): Line[] {
  const g = geometry as { type?: unknown; coordinates?: unknown } | null;
  if (!g || typeof g !== "object" || !Array.isArray(g.coordinates)) return [];
  const ring = (polygon: unknown): Line =>
    Array.isArray(polygon) && Array.isArray(polygon[0]) ? (polygon[0] as unknown[]).map(point).filter((p): p is [number, number] => !!p) : [];
  if (g.type === "Polygon") return [ring(g.coordinates)].filter((r) => r.length >= 4);
  if (g.type === "MultiPolygon") return g.coordinates.map(ring).filter((r) => r.length >= 4);
  return [];
}

function first<T>(list: unknown, read: (item: Record<string, unknown>) => T | undefined): T | undefined {
  if (!Array.isArray(list)) return undefined;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const value = read(item as Record<string, unknown>);
    if (value !== undefined) return value;
  }
  return undefined;
}

function nameOf(row: Row): string | null {
  const names = row.names as { primary?: unknown } | null | undefined;
  return typeof names?.primary === "string" && names.primary.trim() ? names.primary.trim() : null;
}

/** Does any whole-length road flag say this? (Partial flags are ignored.) */
function flagged(row: Row, flag: string): boolean {
  return Boolean(
    first(row.road_flags, (rule) => {
      const values = rule.values;
      if (rule.between != null || !Array.isArray(values)) return undefined;
      return values.includes(flag) ? true : undefined;
    }),
  );
}

/** One Overture transportation segment as the loader's street or rail way, or null. */
export function wayFromSegment(row: Row): OsmWay[] {
  const id = typeof row.id === "string" ? row.id : "";
  const kind = typeof row.class === "string" ? row.class : "";
  const subclass = typeof row.subclass === "string" ? row.subclass : null;
  const lines = linesOf(row.geometry);
  if (!id || lines.length === 0) return [];
  const name = nameOf(row);
  if (row.subtype === "rail") {
    if (!RAIL_CLASSES.has(kind)) return [];
    const railway = kind === "standard_gauge" ? "rail" : kind;
    return lines.map((points) => ({
      id: overtureNumber(id),
      name,
      kind: "rail" as const,
      tags: { railway },
      points,
      lineColour: null,
      lineRef: null,
    }));
  }
  if (row.subtype !== "road" || !ROAD_CLASSES.has(kind)) return [];
  // Tunnels run under the buildings; they are not drawn on the ground.
  if (flagged(row, "is_tunnel") || flagged(row, "is_underground")) return [];
  const highway = subclass === "link" && LINKABLE.has(kind) ? `${kind}_link` : kind;
  const tags: Record<string, string> = {};
  if (subclass === "sidewalk") tags.footway = "sidewalk";
  if (subclass === "crosswalk") tags.footway = "crossing";
  if (subclass === "driveway" || subclass === "alley" || subclass === "parking_aisle") tags.service = subclass;
  const surface = first(row.road_surface, (rule) => (rule.between == null && typeof rule.value === "string" ? rule.value : undefined));
  if (surface) tags.surface = UNPAVED.has(surface) ? "unpaved" : surface;
  if (flagged(row, "is_bridge")) tags.bridge = "yes";
  return lines.map((points) => ({
    id: overtureNumber(id),
    name,
    kind: "road" as const,
    highway,
    building: null,
    water: null,
    waterway: null,
    tags,
    points,
  }));
}

/** One Overture water feature as water areas, or nothing for pools, fountains, and lines. */
export function waterFromRow(row: Row): OsmWay[] {
  const id = typeof row.id === "string" ? row.id : "";
  const kind = typeof row.class === "string" ? row.class : "";
  if (!id || !WATER_CLASSES.has(kind)) return [];
  const name = nameOf(row);
  return outerRingsOf(row.geometry).map((points) => ({
    id: overtureNumber(id),
    name,
    kind: "water" as const,
    water: kind,
    waterway: null,
    points,
  }));
}

async function readCollection(
  collection: "segment" | "water",
  columns: string[],
  box: NeighborhoodBox,
  toWays: (row: Row) => OsmWay[],
): Promise<OsmWay[]> {
  const ways: OsmWay[] = [];
  for (const url of await filesFor(collection, box)) {
    const { file, metadata } = await openParquet(url);
    let start = 0;
    for (const group of metadata.row_groups) {
      const end = start + Number(group.num_rows);
      if (groupOverlaps(group, box)) {
        const rows = (await parquetReadObjects({ file, metadata, rowStart: start, rowEnd: end, columns, compressors })) as Row[];
        for (const row of rows) {
          const b = row.bbox as { xmin?: number; ymin?: number; xmax?: number; ymax?: number } | undefined;
          if (b && typeof b.xmin === "number" && !intersects(box, b.xmin, b.ymin ?? 0, b.xmax ?? 0, b.ymax ?? 0)) continue;
          ways.push(...toWays(row));
        }
      }
      start = end;
    }
  }
  return ways;
}

/**
 * Streets, paths, rail, and water areas in a box, from Overture. Throws when
 * the files cannot be read, so the caller can fall back further.
 */
export async function fetchOvertureBase(box: NeighborhoodBox): Promise<OsmWay[]> {
  const [roads, water] = await Promise.all([
    readCollection("segment", ["id", "names", "subtype", "class", "subclass", "road_surface", "road_flags", "geometry", "bbox"], box, wayFromSegment),
    readCollection("water", ["id", "names", "subtype", "class", "geometry", "bbox"], box, waterFromRow).catch(() => [] as OsmWay[]),
  ]);
  return [...roads, ...water];
}
