/** GeoJSON geometry helpers for Overture rows (hyparquet decodes GeoParquet to GeoJSON). */

export type Line = [number, number][];

function point(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || typeof value[0] !== "number" || typeof value[1] !== "number") return null;
  return [value[0], value[1]];
}

/** Lines of a GeoJSON LineString or MultiLineString. */
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
