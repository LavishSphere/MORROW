/**
 * Ocean polygons from OpenStreetMap coastline, inside one rectangle.
 *
 * OSM coastline keeps land on the left and water on the right. Each piece
 * that crosses the rectangle is clipped to it; the ocean is then traced by
 * following a coast piece to where it leaves the rectangle and walking the
 * rectangle's edge (water side) to where the next piece comes back in.
 * Islands fully inside the rectangle become holes.
 *
 * This replaces a fixed-width band on the water side of every line. That
 * band crossed narrow channels (the Intracoastal, Biscayne Bay, Mission
 * Creek) and flooded the land on the far shore.
 *
 * Coordinates are scene x (east) and z (south). In that frame, walking a
 * ring with its inside on the right gives a positive shoelace sum.
 */

export type Pt = readonly [number, number];
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
export type OceanPolygon = { outer: Pt[]; holes: Pt[][] };
export type OceanResult = {
  polygons: OceanPolygon[];
  /**
   * False when a coast piece stops inside the rectangle (the download did
   * not include its neighbor). The polygons are then not trustworthy.
   */
  complete: boolean;
};

const EPS = 1e-6;

function same(a: Pt, b: Pt, tol: number) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
}

/** Shoelace sum. Positive when the inside is on the right of travel (x east, z south). */
export function rightHandArea(ring: readonly Pt[]) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

export function insidePolygon(x: number, z: number, ring: readonly Pt[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Join coastline pieces end to start. Direction is kept: a coastline piece
 * is never reversed, because reversing it would swap land and water.
 */
export function stitchCoast(lines: readonly (readonly Pt[])[], tol = 0.05): Pt[][] {
  const pool = lines.filter((line) => line.length >= 2).map((line) => line.slice());
  const chains: Pt[][] = [];
  while (pool.length > 0) {
    const chain = pool.pop()!;
    let progressed = true;
    while (progressed && !(chain.length >= 4 && same(chain[0]!, chain[chain.length - 1]!, tol))) {
      progressed = false;
      for (let i = 0; i < pool.length; i += 1) {
        const other = pool[i]!;
        if (same(chain[chain.length - 1]!, other[0]!, tol)) chain.push(...other.slice(1));
        else if (same(other[other.length - 1]!, chain[0]!, tol)) chain.unshift(...other.slice(0, -1));
        else continue;
        pool.splice(i, 1);
        progressed = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

function inRect(p: Pt, r: Rect) {
  return p[0] > r.minX && p[0] < r.maxX && p[1] > r.minZ && p[1] < r.maxZ;
}

/** Liang–Barsky: the part of segment a→b inside the rectangle, as [t0, t1], or null. */
function clipSegment(a: Pt, b: Pt, r: Rect): [number, number] | null {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, a[0] - r.minX],
    [dx, r.maxX - a[0]],
    [-dz, a[1] - r.minZ],
    [dz, r.maxZ - a[1]],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Position along the rectangle edge, increasing in the direction that keeps
 * the rectangle's inside on the right: north edge eastward, east edge
 * southward, south edge westward, west edge northward.
 */
function perimeterT(p: Pt, r: Rect) {
  const w = r.maxX - r.minX;
  const h = r.maxZ - r.minZ;
  const dN = Math.abs(p[1] - r.minZ);
  const dE = Math.abs(p[0] - r.maxX);
  const dS = Math.abs(p[1] - r.maxZ);
  const dW = Math.abs(p[0] - r.minX);
  const m = Math.min(dN, dE, dS, dW);
  if (m === dN) return p[0] - r.minX;
  if (m === dE) return w + (p[1] - r.minZ);
  if (m === dS) return w + h + (r.maxX - p[0]);
  return 2 * w + h + (r.maxZ - p[1]);
}

type Run = { points: Pt[]; entryT: number; exitT: number };

/** Split one open chain into the runs that cross the rectangle. Null if it ends inside. */
function runsOf(chain: readonly Pt[], r: Rect): Run[] | null {
  const runs: Run[] = [];
  let current: Pt[] | null = null;
  for (let i = 0; i < chain.length - 1; i += 1) {
    const a = chain[i]!;
    const b = chain[i + 1]!;
    const clip = clipSegment(a, b, r);
    if (!clip) {
      if (current) return null;
      continue;
    }
    const [t0, t1] = clip;
    if (!current) {
      // Starting inside the rectangle means the piece before it is missing.
      if (t0 <= EPS && inRect(a, r)) return null;
      current = [lerp(a, b, t0)];
    }
    if (t1 < 1 - EPS || !inRect(b, r)) {
      current.push(lerp(a, b, t1));
      if (current.length >= 2 && !same(current[0]!, current[current.length - 1]!, EPS)) {
        runs.push({
          points: current,
          entryT: perimeterT(current[0]!, r),
          exitT: perimeterT(current[current.length - 1]!, r),
        });
      }
      current = null;
    } else {
      current.push(b);
    }
  }
  if (current) return null;
  return runs;
}

/** Rectangle corners passed when walking the edge from t forward by d. */
function cornersBetween(t: number, d: number, r: Rect): Pt[] {
  const w = r.maxX - r.minX;
  const h = r.maxZ - r.minZ;
  const perimeter = 2 * (w + h);
  const corners: [number, Pt][] = [
    [0, [r.minX, r.minZ]],
    [w, [r.maxX, r.minZ]],
    [w + h, [r.maxX, r.maxZ]],
    [2 * w + h, [r.minX, r.maxZ]],
  ];
  const out: [number, Pt][] = [];
  for (const lift of [0, perimeter]) {
    for (const [ct, p] of corners) {
      const at = ct + lift;
      if (at > t + EPS && at < t + d - EPS) out.push([at, p]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** The ocean inside `rect`, traced from coastline lines in scene coordinates. */
export function oceanPolygons(lines: readonly (readonly Pt[])[], rect: Rect): OceanResult {
  const w = rect.maxX - rect.minX;
  const h = rect.maxZ - rect.minZ;
  const perimeter = 2 * (w + h);
  const runs: Run[] = [];
  const islands: Pt[][] = [];
  const waterRings: Pt[][] = [];

  for (const chain of stitchCoast(lines)) {
    const closed = chain.length >= 4 && same(chain[0]!, chain[chain.length - 1]!, 0.05);
    if (closed) {
      const ring = chain.slice(0, -1);
      const outside = ring.findIndex((p) => !inRect(p, rect));
      if (outside < 0) {
        if (rightHandArea(ring) > 0) waterRings.push(ring);
        else islands.push(ring);
        continue;
      }
      // A ring that crosses the edge: start it outside so its runs are whole.
      const rotated = [...ring.slice(outside), ...ring.slice(0, outside), ring[outside]!];
      const pieces = runsOf(rotated, rect);
      if (!pieces) return { polygons: [], complete: false };
      runs.push(...pieces);
      continue;
    }
    const pieces = runsOf(chain, rect);
    if (!pieces) return { polygons: [], complete: false };
    runs.push(...pieces);
  }

  const outers: Pt[][] = [];
  if (runs.length === 0) {
    // No coast crosses the edge. Islands inside mean the rectangle is sea.
    if (islands.length > 0) {
      outers.push([
        [rect.minX, rect.minZ],
        [rect.maxX, rect.minZ],
        [rect.maxX, rect.maxZ],
        [rect.minX, rect.maxZ],
      ]);
    }
  } else {
    const used = new Set<Run>();
    for (const start of runs) {
      if (used.has(start)) continue;
      const ring: Pt[] = [];
      let cur = start;
      for (let guard = 0; guard <= runs.length; guard += 1) {
        used.add(cur);
        ring.push(...cur.points);
        let next: Run | null = null;
        let best = Infinity;
        for (const run of runs) {
          const d = (((run.entryT - cur.exitT) % perimeter) + perimeter) % perimeter;
          if (d < best) {
            best = d;
            next = run;
          }
        }
        if (!next) break;
        ring.push(...cornersBetween(cur.exitT, best, rect));
        if (next === start) break;
        if (used.has(next)) return { polygons: [], complete: false };
        cur = next;
      }
      if (ring.length >= 3) outers.push(ring);
    }
  }

  const polygons: OceanPolygon[] = outers.map((outer) => ({ outer, holes: [] }));
  for (const island of islands) {
    const [x, z] = island[0]!;
    const home = polygons.find((polygon) => insidePolygon(x, z, polygon.outer));
    home?.holes.push(island);
  }
  for (const ring of waterRings) polygons.push({ outer: ring, holes: [] });
  return { polygons, complete: true };
}
