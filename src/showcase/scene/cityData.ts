import { ROAD_TOP, SIDEWALK_TOP } from "../layout";

export const ROAD_XS = [-36, 0, 36] as const;
export const ROAD_ZS = [-36, 0, 36] as const;
export const ROAD_HALF = 5;
export const SIDEWALK_WIDTH = 2.6;
export const PAVEMENT = ROAD_HALF + SIDEWALK_WIDTH;
export const CITY_LIMIT = 54;
export const WALK_LIMIT = 70;

/** Sidewalk just north of the crossing, looking south at the curb. */
export const SPAWN = { x: 6.15, z: 13.4, yaw: Math.PI };

export type Block = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
};

export type Obstacle = {
  x: number;
  z: number;
  w: number;
  d: number;
};

export const BUILDINGS: readonly Block[] = [
  { x: 14, z: 16, w: 8, d: 10, h: 11, color: "#1c2633" },
  { x: 23, z: 14, w: 6.5, d: 8, h: 20, color: "#243447" },
  { x: 17, z: 25, w: 11, d: 5.5, h: 7, color: "#1a2836" },
  { x: 15, z: -15, w: 9, d: 9, h: 13, color: "#222c3a" },
  { x: 24, z: -22, w: 6, d: 11, h: 28, color: "#2a3a4e" },
  { x: 16, z: -25, w: 12, d: 5, h: 6.5, color: "#1e2a38" },
  { x: -14, z: -16, w: 8, d: 8, h: 9, color: "#243140" },
  { x: -23, z: -14, w: 6.5, d: 10, h: 15, color: "#1a2430" },
  { x: -16, z: -25, w: 12, d: 5, h: 6, color: "#2c3a4a" },
  { x: 48, z: 4, w: 8, d: 14, h: 34, color: "#1b2836" },
  { x: 47, z: 24, w: 7, d: 10, h: 18, color: "#243447" },
  { x: 47, z: -18, w: 8, d: 12, h: 16, color: "#1e2c3c" },
  { x: -48, z: 10, w: 8, d: 16, h: 26, color: "#223044" },
  { x: -47, z: -16, w: 7, d: 11, h: 14, color: "#1a2634" },
  { x: 8, z: 48, w: 12, d: 7, h: 22, color: "#2a3848" },
  { x: -14, z: 47, w: 10, d: 7, h: 12, color: "#1c2834" },
  { x: 2, z: -48, w: 14, d: 7, h: 24, color: "#243446" },
  { x: 22, z: -47, w: 8, d: 6, h: 10, color: "#1a2432" },
];

export const TREES: readonly (readonly [number, number])[] = [
  [-16, 16],
  [-22, 22],
  [-12, 21],
  [-21, 12],
  [-14, 12],
  [-18, 18],
  [-24, 17],
  [-11, 15],
  [10, 22],
  [-10, -20],
  [20, 20],
  [12, -22],
];

export type ParkedCar = Obstacle & { rot: number; color: string };

export const CARS: readonly ParkedCar[] = [
  { x: 3.55, z: 16, w: 1.9, d: 4.4, rot: 0, color: "#1e2832" },
  { x: 3.55, z: 22.5, w: 1.9, d: 4.4, rot: 0, color: "#d5d8dc" },
  { x: -3.55, z: 21, w: 1.9, d: 4.4, rot: Math.PI, color: "#7c3030" },
  { x: 3.55, z: -14, w: 1.9, d: 4.4, rot: 0, color: "#1488FF" },
  { x: -3.55, z: -18, w: 1.9, d: 4.4, rot: Math.PI, color: "#2a3544" },
  { x: 18, z: 3.5, w: 4.4, d: 1.9, rot: Math.PI / 2, color: "#eceae4" },
  { x: -20, z: -3.5, w: 4.4, d: 1.9, rot: Math.PI / 2, color: "#3d4a3a" },
];

export const COLLIDERS: readonly Obstacle[] = [
  ...BUILDINGS.map((building) => ({
    x: building.x,
    z: building.z,
    w: building.w,
    d: building.d,
  })),
  ...CARS.map((car) => ({ x: car.x, z: car.z, w: car.w, d: car.d })),
  ...TREES.map(([x, z]) => ({ x, z, w: 0.7, d: 0.7 })),
];

export function onAsphalt(x: number, z: number): boolean {
  if (Math.abs(x) > CITY_LIMIT || Math.abs(z) > CITY_LIMIT) return false;
  for (const center of ROAD_XS) {
    if (Math.abs(x - center) < ROAD_HALF) return true;
  }
  for (const center of ROAD_ZS) {
    if (Math.abs(z - center) < ROAD_HALF) return true;
  }
  return false;
}

export function onPavement(x: number, z: number): boolean {
  if (Math.abs(x) > CITY_LIMIT || Math.abs(z) > CITY_LIMIT) return true;
  for (const center of ROAD_XS) {
    if (Math.abs(x - center) < PAVEMENT) return true;
  }
  for (const center of ROAD_ZS) {
    if (Math.abs(z - center) < PAVEMENT) return true;
  }
  return false;
}

export function surfaceY(x: number, z: number): number {
  return onAsphalt(x, z) ? ROAD_TOP : SIDEWALK_TOP;
}

export function overlaps(x: number, z: number, box: Obstacle, radius: number): boolean {
  const halfW = box.w / 2 + radius;
  const halfD = box.d / 2 + radius;
  return Math.abs(x - box.x) < halfW && Math.abs(z - box.z) < halfD;
}

export function sidewalkSegments(alongLimit: number, crossCenters: readonly number[]): [number, number][] {
  const bands = crossCenters
    .map((center) => [center - PAVEMENT, center + PAVEMENT] as const)
    .sort((a, b) => a[0] - b[0]);
  const ranges: [number, number][] = [];
  let cursor = -alongLimit;
  for (const [start, end] of bands) {
    const stop = Math.min(start, alongLimit);
    if (stop - cursor > 0.8) ranges.push([cursor, stop]);
    cursor = Math.max(cursor, end);
  }
  if (alongLimit - cursor > 0.8) ranges.push([cursor, alongLimit]);
  return ranges;
}
