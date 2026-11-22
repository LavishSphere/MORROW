import * as THREE from "three";
import {
  dashLine,
  NEUTRAL_TRACK,
  offsetPolyline,
  polylineLength,
  pointAlong,
  type Pt,
  type RailLine,
  type RailNetwork,
} from "../../data/rail.ts";

/**
 * Track geometry, merged per surface so a whole network is a handful of
 * draw calls. Surface track: ballast, two rails, a thin line-coloured
 * stripe between them. Tunnels: a faint dashed line on the ground, nothing
 * solid. Bridges: lifted with simple piers.
 */

/** Scene units are 0.14 per metre: standard gauge is about 0.2. */
export const GAUGE_HALF = 0.1;
const BALLAST_HALF = 0.3;
const MINOR_BALLAST_HALF = 0.18;
/** Ballast sits just under road level, so streets cross over it cleanly. */
const BALLAST_Y = 0.042;
const STRIPE_Y = 0.06;
export const RAIL_Y = 0.078;
const RAIL_HALF = 0.016;
const TUNNEL_Y = 0.088;
const TUNNEL_HALF = 0.06;
/** About 3–4 m up, a little exaggerated like the buildings. */
const BRIDGE_H = 0.55;
const PIER_STEP = 3;
const PLATFORM_H = 0.15;
const PLATFORM_HALF = 0.22;
export const TIE_STEP = 0.15;
/** Trees and furniture stay this far from surface track. */
export const RAIL_CLEARANCE = BALLAST_HALF + 0.35;

class Geo {
  pos: number[] = [];
  nor: number[] = [];

  tri(a: readonly number[], b: readonly number[], c: readonly number[]) {
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!;
    const vy = c[1]! - a[1]!;
    const vz = c[2]! - a[2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i += 1) this.nor.push(nx, ny, nz);
  }

  /** A triangle facing up. */
  up(a: readonly number[], b: readonly number[], c: readonly number[]) {
    const ny = (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!);
    if (ny >= 0) this.tri(a, b, c);
    else this.tri(a, c, b);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** A flat ribbon whose height can change point by point (bridge ramps). */
function ribbon(geo: Geo, points: readonly Pt[], half: number, y: (i: number) => number) {
  if (points.length < 2) return;
  const left = offsetPolyline(points, half);
  const right = offsetPolyline(points, -half);
  for (let i = 0; i < points.length - 1; i += 1) {
    const l0 = [left[i]![0], y(i), left[i]![1]];
    const l1 = [left[i + 1]![0], y(i + 1), left[i + 1]![1]];
    const r0 = [right[i]![0], y(i), right[i]![1]];
    const r1 = [right[i + 1]![0], y(i + 1), right[i + 1]![1]];
    geo.up(l0, l1, r0);
    geo.up(r0, l1, r1);
  }
}

/** Upright walls and a flat top over a closed ring. */
function prism(geo: Geo, ring: readonly Pt[], y0: number, y1: number) {
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    geo.tri([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]]);
    geo.tri([a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]);
  }
  try {
    const faces = THREE.ShapeUtils.triangulateShape(
      ring.map(([x, z]) => new THREE.Vector2(x, z)),
      [],
    );
    for (const [i, j, k] of faces) {
      const a = ring[i!];
      const b = ring[j!];
      const c = ring[k!];
      if (a && b && c) geo.up([a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]]);
    }
  } catch {
    // A self-crossing outline keeps its walls only.
  }
}

function cumulative(points: readonly Pt[]) {
  const out = [0];
  for (let i = 1; i < points.length; i += 1) {
    out.push(out[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  }
  return out;
}

/** Height above ground at distance `s` along a bridge of length `total`: ramps up at both ends. */
export function bridgeLift(s: number, total: number) {
  const ramp = Math.min(2.5, total / 3);
  if (ramp <= 0) return 0;
  return BRIDGE_H * Math.max(0, Math.min(1, Math.min(s, total - s) / ramp));
}

export type RailBuilt = {
  ballast: THREE.BufferGeometry;
  minorBallast: THREE.BufferGeometry;
  rails: THREE.BufferGeometry;
  stripes: { colour: string; geometry: THREE.BufferGeometry }[];
  tunnels: { colour: string; geometry: THREE.BufferGeometry }[];
  /** Bridge decks and piers. */
  deck: THREE.BufferGeometry;
  platforms: THREE.BufferGeometry;
  /** Tie spots on surface track: x, y, z, heading angle per tie. */
  ties: Float32Array;
};

/** Height function for a line: zero on the ground, a ramped lift on a bridge. */
function liftOf(line: RailLine) {
  if (!line.bridge) return () => 0;
  const along = cumulative(line.points);
  const total = along[along.length - 1] ?? 0;
  return (i: number) => bridgeLift(along[i] ?? 0, total);
}

export function buildRailGeometry(network: RailNetwork): RailBuilt {
  const ballast = new Geo();
  const minorBallast = new Geo();
  const rails = new Geo();
  const deck = new Geo();
  const platforms = new Geo();
  const stripes = new Map<string, Geo>();
  const tunnels = new Map<string, Geo>();
  const ties: number[] = [];
  const bucket = (map: Map<string, Geo>, key: string) => {
    let geo = map.get(key);
    if (!geo) {
      geo = new Geo();
      map.set(key, geo);
    }
    return geo;
  };

  for (const line of network.lines) {
    if (line.underground) {
      if (line.minor) continue;
      const geo = bucket(tunnels, line.colour ?? NEUTRAL_TRACK);
      for (const dash of dashLine(line.points, 0.7, 0.5)) ribbon(geo, dash, TUNNEL_HALF, () => TUNNEL_Y);
      continue;
    }
    const lift = liftOf(line);
    const half = line.minor ? MINOR_BALLAST_HALF : BALLAST_HALF;
    if (line.bridge) {
      // A concrete deck under the ballast, then piers down to the ground.
      ribbon(deck, line.points, half + 0.06, (i) => lift(i) + BALLAST_Y - 0.01);
      const along = cumulative(line.points);
      const total = along[along.length - 1] ?? 0;
      for (let s = PIER_STEP / 2; s < total; s += PIER_STEP) {
        const h = bridgeLift(s, total);
        if (h < 0.2) continue;
        const p = pointAlong(line.points, s);
        const w = 0.09;
        const ring: Pt[] = [
          [p.x - w, p.z - w],
          [p.x + w, p.z - w],
          [p.x + w, p.z + w],
          [p.x - w, p.z + w],
        ];
        prism(deck, ring, 0, h + BALLAST_Y - 0.02);
      }
    }
    ribbon(line.minor ? minorBallast : ballast, line.points, half, (i) => lift(i) + BALLAST_Y);
    for (const side of [GAUGE_HALF, -GAUGE_HALF]) {
      ribbon(rails, offsetPolyline(line.points, side), RAIL_HALF, (i) => lift(i) + RAIL_Y);
    }
    if (line.colour && !line.minor) {
      ribbon(bucket(stripes, line.colour), line.points, 0.028, (i) => lift(i) + STRIPE_Y);
    }
    const total = polylineLength(line.points);
    const along = cumulative(line.points);
    for (let s = TIE_STEP / 2; s < total; s += TIE_STEP) {
      const p = pointAlong(line.points, s);
      let y = 0;
      if (line.bridge) y = bridgeLift(s, along[along.length - 1] ?? total);
      ties.push(p.x, y + BALLAST_Y + 0.012, p.z, Math.atan2(-p.dz, p.dx));
    }
  }

  for (const platform of network.platforms) {
    if (platform.underground) continue;
    const ring = platform.area
      ? platform.points
      : [...offsetPolyline(platform.points, PLATFORM_HALF), ...offsetPolyline(platform.points, -PLATFORM_HALF).reverse()];
    if (ring.length >= 3) prism(platforms, ring, 0, PLATFORM_H);
  }

  return {
    ballast: ballast.geometry(),
    minorBallast: minorBallast.geometry(),
    rails: rails.geometry(),
    stripes: [...stripes].map(([colour, geo]) => ({ colour, geometry: geo.geometry() })),
    tunnels: [...tunnels].map(([colour, geo]) => ({ colour, geometry: geo.geometry() })),
    deck: deck.geometry(),
    platforms: platforms.geometry(),
    ties: new Float32Array(ties),
  };
}

export function disposeRail(built: RailBuilt) {
  for (const g of [
    built.ballast,
    built.minorBallast,
    built.rails,
    built.deck,
    built.platforms,
    ...built.stripes.map((s) => s.geometry),
    ...built.tunnels.map((t) => t.geometry),
  ]) {
    g.dispose();
  }
}
