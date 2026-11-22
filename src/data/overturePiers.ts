/**
 * Piers and wharves from Overture Maps' infrastructure collection (release
 * 2026-11-18.0): the Ferry Building piers, Santa Monica Pier, Boston's
 * wharves. Deck outlines come through as polygons; a narrow pier mapped as a
 * line is widened into a deck about 6 m across. The reader is
 * fetchOverturePiers in overtureBase.ts; this module stays free of parquet.
 */

import { linesOf, outerRingsOf } from "./overtureGeometry.ts";

type Row = Record<string, unknown>;
type Ring = [number, number][];

/** One pier deck: a closed ring of [lon, lat]. */
export type PierDeck = { id: string; ring: Ring };

/** A line pier is drawn this wide, in metres. */
export const LINE_PIER_WIDTH_M = 6;

const METRES_PER_DEGREE = 111_320;

function closed(ring: Ring): Ring {
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (!a || !b) return ring;
  return a[0] === b[0] && a[1] === b[1] ? ring : [...ring, [a[0], a[1]]];
}

/**
 * A line widened into a closed deck ring, `width` metres across. Corners are
 * mitred (capped at twice the half width so a hairpin does not spike).
 */
export function deckAroundLine(line: readonly (readonly [number, number])[], width = LINE_PIER_WIDTH_M): Ring {
  const points = line.filter((p, i) => i === 0 || p[0] !== line[i - 1]![0] || p[1] !== line[i - 1]![1]);
  if (points.length < 2) return [];
  const lat0 = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const kx = METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const ky = METRES_PER_DEGREE;
  const local = points.map(([lon, lat]) => [lon * kx, lat * ky] as const);
  const half = width / 2;
  const normal = (a: readonly [number, number], b: readonly [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len] as const;
  };
  const left: Ring = [];
  const right: Ring = [];
  for (let i = 0; i < local.length; i += 1) {
    const before = i > 0 ? normal(local[i - 1]!, local[i]!) : null;
    const after = i < local.length - 1 ? normal(local[i]!, local[i + 1]!) : null;
    let [nx, ny] = before && after ? [before[0] + after[0], before[1] + after[1]] : (before ?? after)!;
    const len = Math.hypot(nx, ny);
    if (len < 1e-9) [nx, ny] = (after ?? before)!;
    else {
      nx /= len;
      ny /= len;
    }
    // Mitre: push the corner out so each side stays half a width from its segment.
    const ref = after ?? before!;
    const cos = Math.max(0.5, nx * ref[0] + ny * ref[1]);
    const reach = half / cos;
    const [x, y] = local[i]!;
    left.push([(x + nx * reach) / kx, (y + ny * reach) / ky]);
    right.push([(x - nx * reach) / kx, (y - ny * reach) / ky]);
  }
  return closed([...left, ...right.reverse()]);
}

/** One Overture infrastructure row as pier decks, or nothing when it is not a pier. */
export function piersFromRow(row: Row): PierDeck[] {
  const id = typeof row.id === "string" ? row.id : "";
  if (!id || row.class !== "pier") return [];
  const decks: PierDeck[] = [];
  for (const ring of outerRingsOf(row.geometry)) decks.push({ id, ring: closed(ring) });
  for (const line of linesOf(row.geometry)) {
    const first = line[0]!;
    const last = line[line.length - 1]!;
    // A closed line is already an outline.
    const ring = line.length >= 4 && first[0] === last[0] && first[1] === last[1] ? line : deckAroundLine(line);
    if (ring.length >= 4) decks.push({ id, ring });
  }
  return decks.map((deck, i) => (i === 0 ? deck : { ...deck, id: `${deck.id}:${i}` }));
}

/** The map with pier decks added as "pier" layer polygons. Other features are left as they were. */
export function withPiers(geoJson: unknown, piers: readonly PierDeck[]): unknown {
  const g = geoJson as { type?: unknown; features?: unknown } | null;
  if (!piers.length || !g || g.type !== "FeatureCollection" || !Array.isArray(g.features)) return geoJson;
  const features = piers.map((pier) => ({
    type: "Feature",
    id: `pier-${pier.id}`,
    geometry: { type: "Polygon", coordinates: [pier.ring] },
    properties: { layer: "pier", source: "Overture Maps" },
  }));
  return { ...g, features: [...g.features, ...features] };
}
