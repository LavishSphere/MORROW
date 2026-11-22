import type { OsmWay } from "./overpass.ts";
import type { UsPlace } from "./places.ts";

/** Blocks across and down. A whole small city, not a few streets. */
const BLOCKS_X = 32;
const BLOCKS_Y = 24;
/** One block, in meters. */
const BLOCK_M = 140;

function hashString(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A whole city of streets, sidewalks, and buildings around a geocoded point.
 * The layout is seeded by the place name, so the same address rebuilds the
 * same city. It is not that city's real street grid.
 */
export function generateCity(place: UsPlace): OsmWay[] {
  const rand = rng(hashString(place.label.toLowerCase()));
  const latPerM = 1 / 111320;
  const lonPerM = 1 / (111320 * Math.max(0.2, Math.cos((place.lat * Math.PI) / 180)));
  const blockLat = BLOCK_M * latPerM;
  const blockLon = BLOCK_M * lonPerM;
  const south = place.lat - (BLOCKS_Y * blockLat) / 2;
  const west = place.lng - (BLOCKS_X * blockLon) / 2;
  const yAt = (row: number) => south + row * blockLat;
  const xAt = (col: number) => west + col * blockLon;
  const ways: OsmWay[] = [];
  let id = 1;

  const road = (
    name: string | null,
    highway: string,
    points: [number, number][],
  ) => {
    ways.push({ id: id++, name, kind: "road", highway, building: null, points });
  };

  for (let row = 0; row <= BLOCKS_Y; row += 1) {
    const name = row % 4 === 0 ? `Avenue ${row / 4 + 1}` : null;
    road(name, row % 4 === 0 ? "primary" : "residential", [
      [xAt(0), yAt(row)],
      [xAt(BLOCKS_X), yAt(row)],
    ]);
    if (row < BLOCKS_Y) {
      road(null, "footway", [
        [xAt(0), yAt(row) + blockLat * 0.07],
        [xAt(BLOCKS_X), yAt(row) + blockLat * 0.07],
      ]);
    }
  }
  for (let col = 0; col <= BLOCKS_X; col += 1) {
    const name = col % 4 === 0 ? `Street ${col / 4 + 1}` : null;
    road(name, col % 4 === 0 ? "primary" : "residential", [
      [xAt(col), yAt(0)],
      [xAt(col), yAt(BLOCKS_Y)],
    ]);
    if (col < BLOCKS_X) {
      road(null, "footway", [
        [xAt(col) + blockLon * 0.07, yAt(0)],
        [xAt(col) + blockLon * 0.07, yAt(BLOCKS_Y)],
      ]);
    }
  }

  for (let row = 0; row < BLOCKS_Y; row += 1) {
    for (let col = 0; col < BLOCKS_X; col += 1) {
      const roll = rand();
      if (roll < 0.16) continue;
      const lots = roll > 0.78 ? 3 : roll > 0.42 ? 2 : 1;
      const x0 = xAt(col) + blockLon * 0.16;
      const x1 = xAt(col + 1) - blockLon * 0.16;
      const z0 = yAt(row) + blockLat * 0.16;
      const z1 = yAt(row + 1) - blockLat * 0.16;
      const span = (x1 - x0) / lots;
      for (let lot = 0; lot < lots; lot += 1) {
        const lx0 = x0 + lot * span + span * 0.1;
        const lx1 = x0 + (lot + 1) * span - span * 0.1;
        const lz0 = z0 + rand() * (z1 - z0) * 0.12;
        const lz1 = z1 - rand() * (z1 - z0) * 0.08;
        if (lx1 <= lx0 || lz1 <= lz0) continue;
        const use = rand();
        ways.push({
          id: id++,
          name: null,
          kind: "building",
          highway: null,
          building: use > 0.88 ? "commercial" : use > 0.62 ? "apartments" : "house",
          points: [
            [lx0, lz0],
            [lx1, lz0],
            [lx1, lz1],
            [lx0, lz1],
            [lx0, lz0],
          ],
        });
      }
    }
  }
  return ways;
}
