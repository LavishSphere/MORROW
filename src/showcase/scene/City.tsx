import { Sparkles } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import town from "../../../data/wellesley/town.geojson";
import { detectIssues } from "../../../shared/issues.ts";
import { publishMap, type Bounds, type CityMap } from "../cityStore";
import { publishIssues } from "../issueStore";
import { createProjector, isFeatureCollection, type ShowcaseBBox } from "../geo";
import { INTERVENTION_EDGE_IDS, SHOWCASE_BBOX } from "../layout";
import { GLASS_TINTS, worldCurtainWall } from "./glass";
import { parseBasemap, type ParsedBasemap, type WayRibbon } from "./parseBasemap";
import { AddressPin } from "./AddressPin";
import { IssueLayer } from "./IssueLayer";
import { StreetSigns, type SignSpot } from "./StreetSigns";

/**
 * Wellesley, reimagined. Every building, road, and footpath comes from
 * OpenStreetMap at its true position and outline: by default the wider
 * town extract in data/wellesley/town.geojson (College, Wellesley Square,
 * and the streets around them), or a loaded US city. Buildings are rebuilt
 * as glass with green roofs; heights are a design choice (OSM has none
 * here), not a survey.
 *
 * Thousands of buildings stay fast because each kind of surface is merged
 * into one mesh, and trees and street furniture are instanced.
 */

/** Scene units per metre. */
const CITY_SCALE = 0.14;
/** Width of the Wellesley College showcase; the opening camera frames this. */
export const CITY_SPAN = createProjector(SHOWCASE_BBOX, CITY_SCALE).span;

/** One glass bay and one floor, in scene units (about 4 m and 5 m). */
const BAY = 0.55;
const FLOOR_H = 0.75;
const PODIUM_H = 0.35;

/** Floors by OSM building type, before a little per-building variation. */
const FLOORS: Record<string, number> = {
  university: 9,
  college: 7,
  dormitory: 7,
  apartments: 8,
  commercial: 6,
  retail: 4,
  office: 8,
  chapel: 4,
  church: 4,
  house: 3,
  detached: 3,
  residential: 4,
  garage: 1,
  garages: 1,
  shed: 1,
};

const STONE = "#d9dcd8";
const ROOF_METAL = "#dfe5e8";
const ROOF_GARDEN = "#5f8f55";
const LAWN = "#7d9a68";
const SMART_LINE = "#8ff3ff";
const LOGO_BLUE = "#1488ff";
const GREEN = ["#3f6f3a", "#4b7d40", "#5a8c48", "#6a9a50"] as const;
const AUTUMN = ["#b98c3a", "#c99a4c", "#b8692c"] as const;

type Ring = readonly (readonly [number, number])[];

type CityModel = {
  parsed: ParsedBasemap;
  /** OSM building tag per footprint id, for the height rule. */
  kinds: Map<string, string>;
  bounds: Bounds;
  /** Longitude/latitude → scene [x, z] for this map. */
  project: (lon: number, lat: number) => readonly [number, number];
  /** Scene [x, z] → longitude/latitude. */
  unproject: (x: number, z: number) => readonly [number, number];
  /** Longitude / latitude box of the map's buildings. */
  geoBounds: { west: number; south: number; east: number; north: number };
};

function hash(a: number, b: number) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function idHash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

/* —— Model —— */

/** Bounding box of a FeatureCollection; buildings define the neighborhood. */
function bboxOf(geoJson: unknown): ShowcaseBBox | null {
  if (!isFeatureCollection(geoJson)) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      west = Math.min(west, value[0]);
      east = Math.max(east, value[0]);
      south = Math.min(south, value[1]);
      north = Math.max(north, value[1]);
      return;
    }
    for (const item of value) visit(item);
  };
  const features = geoJson.features as {
    geometry?: { coordinates?: unknown };
    properties?: Record<string, unknown>;
  }[];
  const buildings = features.filter((f) => f.properties?.layer === "building");
  for (const feature of buildings.length > 0 ? buildings : features) {
    visit(feature.geometry?.coordinates);
  }
  if (!Number.isFinite(west)) return null;
  return { west, east, south, north, center: [(west + east) / 2, (south + north) / 2] };
}

/** Parse any basemap-shaped FeatureCollection into the city's model. */
function buildModel(geoJson: unknown, center?: readonly [number, number]): CityModel {
  const own = (geoJson as { center?: unknown })?.center;
  if (!center && Array.isArray(own) && typeof own[0] === "number" && typeof own[1] === "number") {
    // A loaded city keeps one fixed center, so adding areas never moves the scene.
    center = [own[0], own[1]];
  }
  const box = bboxOf(geoJson) ?? SHOWCASE_BBOX;
  const bbox: ShowcaseBBox = center ? { ...box, center: [center[0], center[1]] } : box;
  const projector = createProjector(bbox, CITY_SCALE);
  const parsed = parseBasemap(geoJson, projector) ?? { buildings: [], ways: [] };
  const kinds = new Map<string, string>();
  if (isFeatureCollection(geoJson)) {
    for (const feature of geoJson.features) {
      const props = (feature as { properties?: Record<string, unknown> }).properties;
      if (props?.layer === "building") kinds.set(String(props.osmId), String(props.building ?? "yes"));
    }
  }
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const rings =
    parsed.buildings.length > 0 ? parsed.buildings.map((b) => b.ring) : parsed.ways.map((w) => w.points);
  for (const ring of rings) {
    for (const [x, z] of ring) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minZ = Math.min(bounds.minZ, z);
      bounds.maxZ = Math.max(bounds.maxZ, z);
    }
  }
  if (!Number.isFinite(bounds.minX)) Object.assign(bounds, { minX: -40, maxX: 40, minZ: -40, maxZ: 40 });
  return {
    parsed,
    kinds,
    bounds,
    project: projector.project,
    unproject: (x: number, z: number) => {
      const [lon0, lat0] = bbox.center;
      const metersPerDegLon = 111_320 * Math.max(0.2, Math.cos((lat0 * Math.PI) / 180));
      return [lon0 + x / (CITY_SCALE * metersPerDegLon), lat0 - z / (CITY_SCALE * 111_320)] as const;
    },
    geoBounds: { west: box.west, south: box.south, east: box.east, north: box.north },
  };
}

/** The Wellesley town extract, centered on the College showcase. */
const TOWN = buildModel(town, SHOWCASE_BBOX.center);

/* —— Geometry buckets: many shapes, one mesh —— */

class Bucket {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];

  push(p: readonly number[], n: readonly number[], uv: readonly number[]) {
    this.pos.push(...p);
    this.nor.push(...n, ...n, ...n);
    this.uv.push(...uv);
  }

  /** A ground-facing triangle, wound so it faces up. */
  up(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], y: number) {
    const cross = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    const [p, q] = cross >= 0 ? [b, c] : [c, b];
    this.push([a[0], y, a[1], p[0], y, p[1], q[0], y, q[1]], [0, 1, 0], [a[0], a[1], p[0], p[1], q[0], q[1]]);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

function signedArea(ring: Ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i]!;
    const [x2, z2] = ring[(i + 1) % ring.length]!;
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function centroid(ring: Ring): [number, number] {
  let x = 0;
  let z = 0;
  for (const [px, pz] of ring) {
    x += px;
    z += pz;
  }
  return [x / ring.length, z / ring.length];
}

function shrink(ring: Ring, factor: number): Ring {
  const [cx, cz] = centroid(ring);
  return ring.map(([x, z]) => [cx + (x - cx) * factor, cz + (z - cz) * factor] as const);
}

/** Outward-facing walls. UVs run along the wall in world units, so glass panes stay square. */
function walls(bucket: Bucket, ring: Ring, y0: number, y1: number) {
  const outward = signedArea(ring) > 0;
  const h = y1 - y0;
  let u = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) continue;
    const n = outward ? [dz / len, 0, -dx / len] : [-dz / len, 0, dx / len];
    const A0 = [ax, y0, az];
    const B0 = [bx, y0, bz];
    const B1 = [bx, y1, bz];
    const A1 = [ax, y1, az];
    const uvA0 = [u, 0];
    const uvB0 = [u + len, 0];
    const uvB1 = [u + len, h];
    const uvA1 = [u, h];
    if (outward) {
      bucket.push([...A0, ...B1, ...B0], n, [...uvA0, ...uvB1, ...uvB0]);
      bucket.push([...A0, ...A1, ...B1], n, [...uvA0, ...uvA1, ...uvB1]);
    } else {
      bucket.push([...A0, ...B0, ...B1], n, [...uvA0, ...uvB0, ...uvB1]);
      bucket.push([...A0, ...B1, ...A1], n, [...uvA0, ...uvB1, ...uvA1]);
    }
    u += len;
  }
}

/** A flat roof over a footprint. */
function cap(bucket: Bucket, ring: Ring, y: number) {
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const a = ring[i!];
    const b = ring[j!];
    const c = ring[k!];
    if (a && b && c) bucket.up(a, b, c, y);
  }
}

/** A ribbon along a polyline with mitered joins, so bends are one surface. */
function strip(bucket: Bucket, points: Ring, halfWidth: number, y: number) {
  const clean = points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1]) > 1e-4,
  );
  if (clean.length < 2) return;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < clean.length; i += 1) {
    const prev = clean[Math.max(0, i - 1)]!;
    const next = clean[Math.min(clean.length - 1, i + 1)]!;
    const here = clean[i]!;
    const inLen = Math.hypot(here[0] - prev[0], here[1] - prev[1]) || 1;
    const outLen = Math.hypot(next[0] - here[0], next[1] - here[1]) || 1;
    const n1x = i === 0 ? -(next[1] - here[1]) / outLen : -(here[1] - prev[1]) / inLen;
    const n1z = i === 0 ? (next[0] - here[0]) / outLen : (here[0] - prev[0]) / inLen;
    const n2x = i === clean.length - 1 ? n1x : -(next[1] - here[1]) / outLen;
    const n2z = i === clean.length - 1 ? n1z : (next[0] - here[0]) / outLen;
    let mx = n1x + n2x;
    let mz = n1z + n2z;
    const mLen = Math.hypot(mx, mz) || 1;
    mx /= mLen;
    mz /= mLen;
    // Stretch at the bend so the edge stays parallel; cap sharp corners.
    const w = halfWidth * Math.min(2.5, 1 / Math.max(0.2, mx * n1x + mz * n1z));
    left.push([here[0] + mx * w, here[1] + mz * w]);
    right.push([here[0] - mx * w, here[1] - mz * w]);
  }
  for (let i = 0; i < clean.length - 1; i += 1) {
    bucket.up(left[i]!, left[i + 1]!, right[i]!, y);
    bucket.up(right[i]!, left[i + 1]!, right[i + 1]!, y);
  }
}

/* —— Occupancy grid: where trees may not go —— */

function insideRing(x: number, z: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function nearRing(x: number, z: number, ring: Ring, margin: number) {
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
    if (Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)) < margin) return true;
  }
  return false;
}

class Occupancy {
  readonly cell = 0.8;
  readonly cols: number;
  readonly rows: number;
  readonly data: Uint8Array;
  readonly heights: Float32Array;
  readonly bounds: Bounds;

  constructor(bounds: Bounds) {
    this.bounds = bounds;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / this.cell) + 1;
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / this.cell) + 1;
    this.data = new Uint8Array(this.cols * this.rows);
    this.heights = new Float32Array(this.cols * this.rows);
  }

  private index(x: number, z: number) {
    const c = Math.floor((x - this.bounds.minX) / this.cell);
    const r = Math.floor((z - this.bounds.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private set(x: number, z: number) {
    const k = this.index(x, z);
    if (k >= 0) this.data[k] = 1;
  }

  markHeight(ring: Ring, height: number) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    for (let x = minX; x <= maxX; x += this.cell) {
      for (let z = minZ; z <= maxZ; z += this.cell) {
        if (!insideRing(x, z, ring)) continue;
        const k = this.index(x, z);
        if (k >= 0) this.heights[k] = Math.max(this.heights[k] ?? 0, height);
      }
    }
  }

  nearbyHeight(x: number, z: number, radius: number) {
    const steps = Math.ceil(radius / this.cell);
    let best = 0;
    for (let a = -steps; a <= steps; a += 1) {
      for (let b = -steps; b <= steps; b += 1) {
        const k = this.index(x + a * this.cell, z + b * this.cell);
        if (k >= 0) best = Math.max(best, this.heights[k] ?? 0);
      }
    }
    return best;
  }

  markDisk(x: number, z: number, radius: number) {
    const steps = Math.ceil(radius / this.cell);
    for (let a = -steps; a <= steps; a += 1) {
      for (let b = -steps; b <= steps; b += 1) {
        if (a * a + b * b > steps * steps) continue;
        this.set(x + a * this.cell, z + b * this.cell);
      }
    }
  }

  markRing(ring: Ring, margin: number) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    for (let x = minX - margin; x <= maxX + margin; x += this.cell) {
      for (let z = minZ - margin; z <= maxZ + margin; z += this.cell) {
        if (insideRing(x, z, ring) || nearRing(x, z, ring, margin)) this.set(x, z);
      }
    }
  }

  markLine(points: Ring, radius: number) {
    const steps = Math.ceil(radius / this.cell);
    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, az] = points[i]!;
      const [bx, bz] = points[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
      for (let s = 0; s <= n; s += 1) {
        const x = ax + ((bx - ax) * s) / n;
        const z = az + ((bz - az) * s) / n;
        for (let a = -steps; a <= steps; a += 1) {
          for (let b = -steps; b <= steps; b += 1) this.set(x + a * this.cell, z + b * this.cell);
        }
      }
    }
  }

  taken(x: number, z: number) {
    const k = this.index(x, z);
    return k < 0 || this.data[k] === 1;
  }
}

/* —— Streets —— */

/** Ground width for each OSM way type, in scene units. */
const WAY_HALF_WIDTH: Record<WayRibbon["layer"], number> = {
  road: 0.62,
  sidewalk: 0.22,
  footway: 0.2,
  path: 0.16,
};

const HIGHLIGHT = new Set<string>(INTERVENTION_EDGE_IDS);

/** Points every `spacing` units along a polyline, with heading and side offset. */
function along(points: Ring, spacing: number, offset: number) {
  const out: { x: number; z: number; rot: number }[] = [];
  let carry = spacing / 2;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const nx = -dz / len;
    const nz = dx / len;
    let t = carry;
    while (t < len) {
      out.push({
        x: ax + (dx / len) * t + nx * offset,
        z: az + (dz / len) * t + nz * offset,
        rot: Math.atan2(dx, dz),
      });
      t += spacing;
    }
    carry = t - len;
  }
  return out;
}

/* —— Build everything once per map —— */

type Placement = { x: number; z: number; rot?: number; s?: number; color?: string };

type Built = {
  glass: THREE.BufferGeometry[];
  siding: THREE.BufferGeometry[];
  shingles: THREE.BufferGeometry[];
  garden: THREE.BufferGeometry;
  metal: THREE.BufferGeometry;
  stone: THREE.BufferGeometry;
  roads: THREE.BufferGeometry;
  lines: THREE.BufferGeometry;
  lit: THREE.BufferGeometry;
  walks: Record<"sidewalk" | "footway" | "path", THREE.BufferGeometry>;
  trees: Placement[];
  parks: { x: number; z: number; rx: number; rz: number; rot: number }[];
  ponds: { x: number; z: number; rx: number; rz: number; rot: number }[];
  cars: Placement[];
  people: Placement[];
  lamps: Placement[];
  hydrants: Placement[];
  benches: Placement[];
  signs: SignSpot[];
};

/* —— Suburban houses: siding walls and a pitched gable roof —— */

/** OpenStreetMap building types drawn as houses rather than glass. */
const HOUSE_KINDS = new Set(["house", "detached", "semidetached_house", "bungalow", "terrace", "residential"]);
/**
 * Untyped buildings ("yes") smaller than this footprint (about 250 m², in
 * scene units²) are almost always homes or garages, so they get houses too.
 */
const SMALL_UNTYPED = 250 * 0.14 * 0.14;
const SIDING = ["#f2efe8", "#e8dcc4", "#c9d4dc", "#d9c4a6"] as const;
const SHINGLE = ["#4a4f55", "#6b4f3f", "#3f4a5a"] as const;

type Point3 = readonly [number, number, number];

/** One flat-shaded triangle. */
function tri(bucket: Bucket, a: Point3, b: Point3, c: Point3) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  bucket.push([...a, ...b, ...c], [nx, ny, nz], [0, 0, 1, 0, 0, 1]);
}

/**
 * A house on a real footprint: one or two stories of siding, and a gable
 * roof whose ridge runs along the footprint's longest side. Returns the
 * roof peak height.
 */
function house(siding: Bucket, roof: Bucket, chimney: Bucket, ring: Ring, seed: number) {
  const stories = seed > 0.55 ? 2 : 1;
  const wallTop = 0.08 + stories * 0.62;
  walls(siding, ring, 0, wallTop);

  // Orient a box to the longest wall so the ridge follows the house.
  let longest = 0;
  let angle = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len > longest) {
      longest = len;
      angle = Math.atan2(bz - az, bx - ax);
    }
  }
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let umin = Infinity;
  let umax = -Infinity;
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const [x, z] of ring) {
    const u = x * cos + z * sin;
    const v = -x * sin + z * cos;
    umin = Math.min(umin, u);
    umax = Math.max(umax, u);
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  const eave = 0.12;
  umin -= eave;
  umax += eave;
  vmin -= eave;
  vmax += eave;
  const vmid = (vmin + vmax) / 2;
  const rise = Math.min(1.1, ((vmax - vmin) / 2) * 0.8);
  const at = (u: number, v: number, y: number): Point3 => [u * cos - v * sin, y, u * sin + v * cos];
  const A = at(umin, vmin, wallTop);
  const B = at(umax, vmin, wallTop);
  const C = at(umax, vmax, wallTop);
  const D = at(umin, vmax, wallTop);
  const R1 = at(umin, vmid, wallTop + rise);
  const R2 = at(umax, vmid, wallTop + rise);
  tri(roof, A, B, R2);
  tri(roof, A, R2, R1);
  tri(roof, D, R1, R2);
  tri(roof, D, R2, C);
  // Gable ends in the siding color.
  tri(siding, A, R1, D);
  tri(siding, B, C, R2);

  if (seed > 0.5) {
    const cu = umin + (umax - umin) * 0.75;
    const cv = vmin + (vmax - vmin) * 0.3;
    const half = 0.11;
    const box: Ring = [
      [cu - half, cv - half],
      [cu + half, cv - half],
      [cu + half, cv + half],
      [cu - half, cv + half],
    ].map(([u, v]) => [u * cos - v * sin, u * sin + v * cos] as const);
    const chimneyTop = wallTop + rise + 0.25;
    walls(chimney, box, wallTop, chimneyTop);
    cap(chimney, box, chimneyTop);
  }
  return wallTop + rise;
}

function buildCity(model: CityModel): Built {
  const glass = GLASS_TINTS.map(() => new Bucket());
  const siding = SIDING.map(() => new Bucket());
  const shingles = SHINGLE.map(() => new Bucket());
  const garden = new Bucket();
  const metal = new Bucket();
  const stone = new Bucket();
  const occupancy = new Occupancy(model.bounds);

  for (const building of model.parsed.buildings) {
    const ring = building.ring;
    if (ring.length < 3 || Math.abs(signedArea(ring)) < 0.05) continue;
    const kind = model.kinds.get(building.id) ?? "yes";
    const seed = idHash(building.id);
    if (HOUSE_KINDS.has(kind) || (kind === "yes" && Math.abs(signedArea(ring)) < SMALL_UNTYPED)) {
      const wall = siding[Math.floor(idHash(`${building.id}s`) * siding.length)] ?? siding[0]!;
      const roof = shingles[Math.floor(idHash(`${building.id}r`) * shingles.length)] ?? shingles[0]!;
      const peak = house(wall, roof, stone, ring, seed);
      occupancy.markRing(ring, 0.9);
      occupancy.markHeight(ring, peak);
      continue;
    }
    const floors = (FLOORS[kind] ?? 5) + Math.floor(seed * 7);
    const top = PODIUM_H + floors * FLOOR_H;
    const tint = glass[Math.floor(idHash(`${building.id}c`) * glass.length)] ?? glass[0]!;
    const style = Math.floor(idHash(`${building.id}m`) * 3);

    const podium = shrink(ring, 1.03);
    walls(stone, podium, 0, PODIUM_H);
    cap(stone, podium, PODIUM_H);
    // Same glass city, three silhouettes so the skyline is not one box.
    if (floors >= 8 && style === 2) {
      const step1 = PODIUM_H + Math.max(2, Math.floor(floors * 0.42)) * FLOOR_H;
      const step2 = PODIUM_H + Math.max(4, Math.floor(floors * 0.72)) * FLOOR_H;
      walls(tint, ring, PODIUM_H, step1);
      cap(metal, ring, step1);
      const mid = shrink(ring, 0.74);
      walls(tint, mid, step1, step2);
      cap(metal, mid, step2);
      const crown = shrink(ring, 0.46 + seed * 0.12);
      const crownTop = top + (1 + Math.floor(seed * 3)) * FLOOR_H;
      walls(tint, crown, step2, crownTop);
      cap(metal, crown, crownTop);
    } else if (floors >= 6 && style === 1) {
      const waist = PODIUM_H + Math.max(2, Math.floor(floors * 0.58)) * FLOOR_H;
      walls(tint, ring, PODIUM_H, waist);
      cap(metal, ring, waist);
      const upper = shrink(ring, 0.58 + seed * 0.18);
      walls(tint, upper, waist, top);
      cap(seed > 0.5 ? metal : garden, upper, top);
    } else if (floors >= 9) {
      walls(tint, ring, PODIUM_H, top);
      const crown = shrink(ring, 0.52 + seed * 0.22);
      const crownTop = top + (2 + Math.floor(seed * 3)) * FLOOR_H;
      cap(metal, ring, top);
      walls(tint, crown, top, crownTop);
      cap(metal, crown, crownTop);
    } else {
      walls(tint, ring, PODIUM_H, top);
      cap(garden, ring, top);
    }
    occupancy.markRing(ring, 0.9);
    occupancy.markHeight(ring, top);
  }

  const roads = new Bucket();
  const lines = new Bucket();
  const lit = new Bucket();
  const walks = { sidewalk: new Bucket(), footway: new Bucket(), path: new Bucket() };
  for (const way of model.parsed.ways) {
    const half = WAY_HALF_WIDTH[way.layer];
    occupancy.markLine(way.points, half + 0.6);
    if (way.edgeId && HIGHLIGHT.has(way.edgeId)) {
      strip(lit, way.points, half, 0.045);
    } else if (way.layer === "road") {
      strip(roads, way.points, half, 0.05);
      strip(lines, way.points, 0.035, 0.07);
    } else {
      strip(walks[way.layer], way.points, half, 0.035);
    }
  }

  const { minX, maxX, minZ, maxZ } = model.bounds;
  const parks: Built["parks"] = [];
  const ponds: Built["ponds"] = [];
  const area = Math.max(1, (maxX - minX) * (maxZ - minZ));
  const parkTarget = Math.min(48, Math.max(10, Math.round(area / 7000)));
  const pondTarget = Math.min(36, Math.max(8, Math.round(area / 10000)));
  const spotStep = 7.5;
  const ellipseBlocked = (x: number, z: number, rx: number, rz: number, rot: number, pad: number) => {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let u = -(rx + pad); u <= rx + pad; u += occupancy.cell) {
      for (let v = -(rz + pad); v <= rz + pad; v += occupancy.cell) {
        if ((u * u) / ((rx + pad) * (rx + pad)) + (v * v) / ((rz + pad) * (rz + pad)) > 1) continue;
        if (occupancy.taken(x + u * cos - v * sin, z - u * sin - v * cos)) return true;
      }
    }
    return false;
  };
  const hitsSpot = (
    spots: { x: number; z: number; rx: number; rz: number }[],
    x: number,
    z: number,
    reach: number,
  ) => spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < Math.max(spot.rx, spot.rz) + reach);
  for (let gx = minX; gx <= maxX && (parks.length < parkTarget || ponds.length < pondTarget); gx += spotStep) {
    for (let gz = minZ; gz <= maxZ && (parks.length < parkTarget || ponds.length < pondTarget); gz += spotStep) {
      if (hash(gx + 3, gz + 11) > 0.55) continue;
      const x = gx + (hash(gz, gx + 1) - 0.5) * spotStep;
      const z = gz + (hash(gx + 2, gz) - 0.5) * spotStep;
      // Keep them in the city, in the gaps between buildings, not the empty outskirts.
      if (occupancy.nearbyHeight(x, z, 16) < 1) continue;
      const rot = hash(x + 4, z + 4) * Math.PI;
      const wantPark = hash(x + 1, z + 9) > 0.42 && parks.length < parkTarget;
      if (wantPark) {
        const rx = 2.4 + hash(x, z) * 4.6;
        const rz = rx * (0.52 + hash(z, x) * 0.36);
        if (!hitsSpot(parks, x, z, Math.max(rx, rz) * 0.45) && !ellipseBlocked(x, z, rx, rz, rot, 0.7)) {
          parks.push({ x, z, rx, rz, rot });
        }
      }
      if (ponds.length < pondTarget && hash(z + 2, x + 6) > 0.28) {
        const rx = 0.8 + hash(x + 5, z) * 2.2;
        const rz = rx * (0.5 + hash(z + 3, x) * 0.38);
        const pondRot = hash(x + 8, z + 2) * Math.PI;
        if (!hitsSpot(ponds, x, z, Math.max(rx, rz)) && !ellipseBlocked(x, z, rx, rz, pondRot, 0.7)) {
          occupancy.markDisk(x, z, Math.max(rx, rz) + 0.45);
          ponds.push({ x, z, rx, rz, rot: pondRot });
        }
      }
    }
  }

  // Trees on open lawn only. Size tracks the nearest buildings, with a wider spread.
  const trees: Placement[] = [];
  const step = 2.6;
  for (let gx = minX; gx <= maxX; gx += step) {
    for (let gz = minZ; gz <= maxZ; gz += step) {
      const r = hash(gx, gz);
      if (r < 0.45) continue;
      const x = gx + (hash(gz, gx) - 0.5) * step;
      const z = gz + (hash(gx + 7, gz) - 0.5) * step;
      if (occupancy.taken(x, z)) continue;
      const palette = r > 0.9 ? AUTUMN : GREEN;
      const roll = hash(x + 1, z + 3);
      const near = occupancy.nearbyHeight(x, z, 8);
      const target = near > 1 ? Math.min(near * (0.45 + roll * 0.4), 5.4) : 1.8 + roll * 2.2;
      let s = Math.min(2.9, Math.max(0.65, target / 1.86));
      const crownHitsRoad = (scale: number) => {
        const reach = 0.62 * scale;
        for (let i = 0; i < 6; i += 1) {
          const t = (i / 6) * Math.PI * 2;
          if (occupancy.taken(x + Math.cos(t) * reach, z + Math.sin(t) * reach)) return true;
        }
        return false;
      };
      while (s > 0.65 && crownHitsRoad(s)) s *= 0.8;
      if (crownHitsRoad(s)) continue;
      trees.push({
        x,
        z,
        s,
        color: palette[Math.floor(hash(z, x) * palette.length)] ?? GREEN[0],
      });
    }
  }

  const roadWays = model.parsed.ways.filter((way) => way.layer === "road");
  const CAR_COLORS = ["#e8eef2", "#d4543c", "#3d6fb5", "#f2c14e", "#2f3438", "#7eb0c8"];
  const SHIRTS = ["#ff6b6b", "#ffd23f", "#3ec1d3", "#1488ff", "#8e7cff", "#2ecc71", "#ff9f43", "#f78fb3"];
  const cars: Placement[] = [];
  for (const way of roadWays) {
    const origin = way.points[0] ?? [0, 0];
    const side = hash(origin[0], origin[1]) > 0.5 ? 0.28 : -0.28;
    for (const spot of along(way.points, 8, side)) {
      if (cars.length >= 320 || hash(spot.x, spot.z) < 0.4) continue;
      cars.push({
        ...spot,
        // Local +X is the nose. `along` stores a heading whose long axis sits across the lane.
        rot: spot.rot - Math.PI / 2 + (side < 0 ? Math.PI : 0),
        color: CAR_COLORS[Math.floor(hash(spot.z, spot.x) * CAR_COLORS.length)] ?? CAR_COLORS[0],
      });
    }
  }
  const people: Placement[] = [];
  for (const way of model.parsed.ways) {
    if (way.layer !== "sidewalk" && way.layer !== "footway") continue;
    for (const spot of along(way.points, 4.2, 0)) {
      if (people.length >= 460 || hash(spot.x + 2, spot.z) < 0.52) continue;
      people.push({
        ...spot,
        color: SHIRTS[Math.floor(hash(spot.z + 1, spot.x) * SHIRTS.length)] ?? SHIRTS[0],
      });
    }
  }
  for (const park of parks) {
    if (people.length >= 520 || hash(park.x, park.z) < 0.3) continue;
    const extras = 1 + Math.floor(hash(park.z, park.x) * 3);
    for (let i = 0; i < extras && people.length < 520; i += 1) {
      const angle = hash(park.x + i, park.z) * Math.PI * 2;
      const dist = (0.25 + hash(park.z + i, park.x) * 0.45) * Math.min(park.rx, park.rz);
      people.push({
        x: park.x + Math.cos(angle) * dist,
        z: park.z + Math.sin(angle) * dist,
        rot: angle,
        color: SHIRTS[Math.floor(hash(park.x + i, park.z + 4) * SHIRTS.length)] ?? SHIRTS[0],
      });
    }
  }
  const lamps = roadWays.flatMap((way) => along(way.points, 7, WAY_HALF_WIDTH.road + 0.35));
  const hydrants = roadWays.flatMap((way) => along(way.points, 19, -(WAY_HALF_WIDTH.road + 0.3)));
  const benches = model.parsed.ways
    .filter((way) => way.layer === "footway")
    .flatMap((way) => along(way.points, 13, WAY_HALF_WIDTH.footway + 0.3));

  // Street signs along named roads, spaced so one street never crowds a block.
  const signs: SignSpot[] = [];
  for (const way of roadWays) {
    const name = way.name;
    if (!name) continue;
    for (const spot of along(way.points, 26, WAY_HALF_WIDTH.road + 0.3)) {
      if (signs.some((s) => s.name === name && Math.hypot(s.x - spot.x, s.z - spot.z) < 18)) continue;
      signs.push({ name, x: spot.x, z: spot.z });
    }
  }

  return {
    glass: glass.map((b) => b.geometry()),
    siding: siding.map((b) => b.geometry()),
    shingles: shingles.map((b) => b.geometry()),
    garden: garden.geometry(),
    metal: metal.geometry(),
    stone: stone.geometry(),
    roads: roads.geometry(),
    lines: lines.geometry(),
    lit: lit.geometry(),
    walks: {
      sidewalk: walks.sidewalk.geometry(),
      footway: walks.footway.geometry(),
      path: walks.path.geometry(),
    },
    trees,
    parks,
    ponds,
    cars,
    people,
    lamps,
    hydrants,
    benches,
    signs,
  };
}

/** Outlines for the minimap, plus names for "where am I". */
function mapFor(model: CityModel): CityMap {
  const line = (points: Ring) =>
    points.map(([x, z], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${z.toFixed(1)}`).join("");
  const roads: string[] = [];
  const walks: string[] = [];
  const streets: CityMap["streets"] = [];
  for (const way of model.parsed.ways) {
    if (way.layer !== "road") {
      walks.push(line(way.points));
      continue;
    }
    roads.push(line(way.points));
    if (!way.name) continue;
    for (let i = 0; i < way.points.length - 1; i += 1) {
      const [ax, az] = way.points[i]!;
      const [bx, bz] = way.points[i + 1]!;
      streets.push({ name: way.name, ax, az, bx, bz });
    }
  }
  const buildings = model.parsed.buildings.map((b) => `${line(b.ring)}Z`).join("");
  const places = model.parsed.buildings.flatMap((b) => {
    if (!b.name) return [];
    const [x, z] = centroid(b.ring);
    return [{ name: b.name, x, z }];
  });
  return {
    bounds: model.bounds,
    geoBounds: model.geoBounds,
    project: model.project,
    unproject: model.unproject,
    buildingPoints: model.parsed.buildings.map((b) => centroid(b.ring)),
    buildingKinds: model.parsed.buildings.map((b) => model.kinds.get(b.id) ?? "yes"),
    roads: roads.join(""),
    walks: walks.join(""),
    buildings,
    streets,
    places,
  };
}

/* —— Materials and shared shapes —— */

/** Siding and shingle colors for houses; double-sided so gables always show. */
function useHouseMaterials() {
  const houses = useMemo(
    () => ({
      siding: SIDING.map(
        (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }),
      ),
      shingles: SHINGLE.map(
        (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }),
      ),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const m of [...houses.siding, ...houses.shingles]) m.dispose();
    },
    [houses],
  );
  return houses;
}

function useMaterials() {
  const materials = useMemo(() => {
    const maps = worldCurtainWall(BAY, FLOOR_H);
    const plain = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
    return {
      maps,
      glass: GLASS_TINTS.map(
        (tint) =>
          new THREE.MeshPhysicalMaterial({
            color: tint,
            map: maps.color,
            roughnessMap: maps.rough,
            roughness: 1,
            metalness: 0.78,
            clearcoat: 0.6,
            clearcoatRoughness: 0.12,
            envMapIntensity: 1.4,
          }),
      ),
      surfaces: {
        metal: plain(ROOF_METAL, { metalness: 0.5, roughness: 0.35 }),
        garden: plain(ROOF_GARDEN, { roughness: 0.95 }),
        stone: plain(STONE, { roughness: 0.72 }),
        road: plain("#3b4448", { roughness: 0.85 }),
        line: new THREE.MeshStandardMaterial({
          color: SMART_LINE,
          emissive: SMART_LINE,
          emissiveIntensity: 0.9,
          toneMapped: false,
        }),
        lit: plain(LOGO_BLUE, { emissive: new THREE.Color(LOGO_BLUE), emissiveIntensity: 0.6 }),
        sidewalk: plain("#d3d6d0"),
        footway: plain("#d9d3c4"),
        path: plain("#cfc7b2"),
        park: plain("#3e7c4c", { roughness: 0.95 }),
        water: new THREE.MeshStandardMaterial({
          color: "#3f8fd4",
          roughness: 0.08,
          metalness: 0.55,
        }),
      },
    };
  }, []);
  useEffect(
    () => () => {
      materials.maps.color.dispose();
      materials.maps.rough.dispose();
      for (const m of materials.glass) m.dispose();
      for (const m of Object.values(materials.surfaces)) m.dispose();
    },
    [materials],
  );
  return materials;
}

function mergeGeos(parts: THREE.BufferGeometry[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    const pos = part.getAttribute("position");
    const nor = part.getAttribute("normal");
    const index = part.getIndex();
    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
    if (index) {
      for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i) + offset);
    }
    offset += pos.count;
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

function axle(x: number, z: number, radius: number, width: number) {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 12);
  geo.rotateX(Math.PI / 2);
  geo.translate(x, 0.075, z);
  return geo;
}

function carWindows() {
  const pane = (w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0) => {
    const glass = new THREE.BoxGeometry(w, h, d);
    if (tilt) glass.rotateZ(tilt);
    glass.translate(x, y, z);
    return glass;
  };
  return [
    pane(0.02, 0.11, 0.26, 0.1, 0.27, 0, -0.42),
    pane(0.02, 0.1, 0.24, -0.26, 0.27, 0, 0.35),
    pane(0.3, 0.09, 0.015, -0.08, 0.27, 0.145),
    pane(0.3, 0.09, 0.015, -0.08, 0.27, -0.145),
  ];
}

function useFurniture() {
  const parts = useMemo(() => {
    const at = (g: THREE.BufferGeometry, y: number, z = 0) => g.translate(0, y, z);
    return {
      shapes: {
        trunk: at(new THREE.CylinderGeometry(0.06, 0.09, 0.9, 6), 0.45),
        canopy: at(new THREE.IcosahedronGeometry(0.62, 1).scale(1, 1.15, 1), 1.15),
        pole: at(new THREE.CylinderGeometry(0.025, 0.035, 1.16, 6), 0.58),
        bulb: at(new THREE.SphereGeometry(0.09, 8, 6), 1.18),
        hydrant: at(new THREE.CylinderGeometry(0.09, 0.1, 0.34, 8), 0.17),
        seat: at(new THREE.BoxGeometry(0.6, 0.035, 0.17), 0.17),
        back: at(new THREE.BoxGeometry(0.6, 0.17, 0.025), 0.27, -0.07),
        car: mergeGeos([
          (() => {
            const body = new THREE.BoxGeometry(0.78, 0.15, 0.34);
            body.translate(0.02, 0.16, 0);
            return body;
          })(),
          (() => {
            const roof = new THREE.BoxGeometry(0.28, 0.03, 0.26);
            roof.translate(-0.08, 0.34, 0);
            return roof;
          })(),
        ]),
        windows: mergeGeos(carWindows()),
        wheels: mergeGeos([
          axle(0.22, 0.18, 0.075, 0.05),
          axle(0.22, -0.18, 0.075, 0.05),
          axle(-0.22, 0.18, 0.075, 0.05),
          axle(-0.22, -0.18, 0.075, 0.05),
        ]),
        hubs: mergeGeos([
          axle(0.22, 0.18, 0.032, 0.058),
          axle(0.22, -0.18, 0.032, 0.058),
          axle(-0.22, 0.18, 0.032, 0.058),
          axle(-0.22, -0.18, 0.032, 0.058),
        ]),
        headlights: mergeGeos([
          (() => {
            const lamp = new THREE.BoxGeometry(0.03, 0.04, 0.07);
            lamp.translate(0.4, 0.16, 0.1);
            return lamp;
          })(),
          (() => {
            const lamp = new THREE.BoxGeometry(0.03, 0.04, 0.07);
            lamp.translate(0.4, 0.16, -0.1);
            return lamp;
          })(),
        ]),
        body: at(new THREE.CapsuleGeometry(0.07, 0.2, 4, 6), 0.26),
        head: at(new THREE.SphereGeometry(0.075, 8, 6), 0.5),
      },
      looks: {
        bark: new THREE.MeshStandardMaterial({ color: "#5c4634", roughness: 0.9 }),
        leaves: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
        steel: new THREE.MeshStandardMaterial({ color: "#e9edef", metalness: 0.6, roughness: 0.3 }),
        glow: new THREE.MeshStandardMaterial({
          color: "#fff3c4",
          emissive: "#ffe08a",
          emissiveIntensity: 1.6,
          toneMapped: false,
        }),
        red: new THREE.MeshStandardMaterial({ color: "#e08978", roughness: 0.45 }),
        wood: new THREE.MeshStandardMaterial({ color: "#c9a77c", roughness: 0.7 }),
        paint: new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.55 }),
        glass: new THREE.MeshStandardMaterial({
          color: "#b7e4f5",
          roughness: 0.05,
          metalness: 0.15,
          transparent: true,
          opacity: 0.72,
        }),
        tire: new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.9 }),
        hub: new THREE.MeshStandardMaterial({ color: "#d5d8dc", metalness: 0.7, roughness: 0.25 }),
        lamp: new THREE.MeshStandardMaterial({
          color: "#fff4d2",
          emissive: "#ffe08a",
          emissiveIntensity: 1.4,
          toneMapped: false,
        }),
        shirt: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
        skin: new THREE.MeshStandardMaterial({ color: "#e0b08a", roughness: 0.7 }),
      },
    };
  }, []);
  useEffect(
    () => () => {
      for (const g of Object.values(parts.shapes)) g.dispose();
      for (const m of Object.values(parts.looks)) m.dispose();
    },
    [parts],
  );
  return parts;
}

/** One shape drawn at many spots in a single draw call. */
function Instanced({
  geometry,
  material,
  items,
  shadows = true,
  colored = false,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: Placement[];
  shadows?: boolean;
  /** Use each item's color (tree canopies); otherwise the material's. */
  colored?: boolean;
}) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
    m.count = items.length;
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    items.forEach((item, i) => {
      q.setFromAxisAngle(upAxis, item.rot ?? 0);
      const s = item.s ?? 1;
      matrix.compose(new THREE.Vector3(item.x, 0, item.z), q, new THREE.Vector3(s, s, s));
      m.setMatrixAt(i, matrix);
      if (colored && item.color) m.setColorAt(i, color.set(item.color));
    });
    m.castShadow = shadows;
    m.receiveShadow = true;
    m.raycast = () => null;
    return m;
  }, [geometry, material, items, shadows, colored]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

/**
 * The glass city. With no map it shows the Wellesley town; given a loaded
 * neighborhood (same FeatureCollection shape) it rebuilds from that.
 */
export function City({ geoJson, reducedMotion = false }: { geoJson?: unknown; reducedMotion?: boolean }) {
  const { glass, surfaces } = useMaterials();
  const houses = useHouseMaterials();
  const pondShape = useMemo(() => new THREE.CircleGeometry(1, 18), []);
  useEffect(() => () => pondShape.dispose(), [pondShape]);
  const { shapes, looks } = useFurniture();
  const model = useMemo(() => (geoJson ? buildModel(geoJson) : TOWN), [geoJson]);
  const built = useMemo(() => buildCity(model), [model]);

  useEffect(() => publishMap(mapFor(model)), [model]);
  // Accessibility issues from the map's own OpenStreetMap tags.
  useEffect(() => {
    const source = geoJson ?? town;
    const issues = detectIssues(source).map((issue) => {
      const [x, z] = model.project(issue.point[0], issue.point[1]);
      const path = issue.line.map(([lon, lat]) => {
        const [px, pz] = model.project(lon, lat);
        return [px, pz] as [number, number];
      });
      return { ...issue, x, z, path };
    });
    publishIssues(issues, source, !geoJson);
  }, [model, geoJson]);
  useEffect(
    () => () => {
      for (const g of [
        ...built.glass,
        ...built.siding,
        ...built.shingles,
        built.garden,
        built.metal,
        built.stone,
        built.roads,
        built.lines,
        built.lit,
        ...Object.values(built.walks),
      ]) {
        g.dispose();
      }
    },
    [built],
  );

  return (
    <group name="wellesley-reimagined">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow raycast={() => null}>
        {/* Wide enough that the fog hides its edge from any camera angle. */}
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color={LAWN} roughness={0.95} />
      </mesh>

      <mesh geometry={built.walks.path} material={surfaces.path} receiveShadow raycast={() => null} />
      <mesh geometry={built.walks.sidewalk} material={surfaces.sidewalk} receiveShadow raycast={() => null} />
      <mesh geometry={built.walks.footway} material={surfaces.footway} receiveShadow raycast={() => null} />
      <mesh geometry={built.roads} material={surfaces.road} receiveShadow raycast={() => null} />
      <mesh geometry={built.lines} material={surfaces.line} raycast={() => null} />
      <mesh geometry={built.lit} material={surfaces.lit} raycast={() => null} />

      {built.glass.map((geometry, i) => (
        <mesh
          key={`glass-${i}`}
          geometry={geometry}
          material={glass[i]}
          castShadow
          receiveShadow
          raycast={() => null}
        />
      ))}
      {built.siding.map((geometry, i) => (
        <mesh
          key={`siding-${i}`}
          geometry={geometry}
          material={houses.siding[i]}
          castShadow
          receiveShadow
          raycast={() => null}
        />
      ))}
      {built.shingles.map((geometry, i) => (
        <mesh
          key={`roof-${i}`}
          geometry={geometry}
          material={houses.shingles[i]}
          castShadow
          receiveShadow
          raycast={() => null}
        />
      ))}
      <mesh geometry={built.stone} material={surfaces.stone} castShadow receiveShadow raycast={() => null} />
      <mesh geometry={built.garden} material={surfaces.garden} receiveShadow raycast={() => null} />
      <mesh geometry={built.metal} material={surfaces.metal} castShadow receiveShadow raycast={() => null} />

      {built.parks.map((park) => (
        <mesh
          key={`park-${park.x.toFixed(1)}-${park.z.toFixed(1)}`}
          geometry={pondShape}
          material={surfaces.park}
          position={[park.x, 0.03, park.z]}
          rotation={[-Math.PI / 2, park.rot, 0]}
          scale={[park.rx, park.rz, 1]}
          receiveShadow
          raycast={() => null}
        />
      ))}
      {built.ponds.map((pond) => (
        <mesh
          key={`${pond.x.toFixed(1)}-${pond.z.toFixed(1)}`}
          geometry={pondShape}
          material={surfaces.water}
          position={[pond.x, 0.045, pond.z]}
          rotation={[-Math.PI / 2, pond.rot, 0]}
          scale={[pond.rx, pond.rz, 1]}
          receiveShadow
          raycast={() => null}
        />
      ))}

      <Instanced geometry={shapes.car} material={looks.paint} items={built.cars} colored />
      <Instanced geometry={shapes.windows} material={looks.glass} items={built.cars} shadows={false} />
      <Instanced geometry={shapes.wheels} material={looks.tire} items={built.cars} />
      <Instanced geometry={shapes.hubs} material={looks.hub} items={built.cars} />
      <Instanced geometry={shapes.headlights} material={looks.lamp} items={built.cars} shadows={false} />
      <Instanced geometry={shapes.body} material={looks.shirt} items={built.people} colored />
      <Instanced geometry={shapes.head} material={looks.skin} items={built.people} shadows={false} />
      <Instanced geometry={shapes.trunk} material={looks.bark} items={built.trees} />
      <Instanced geometry={shapes.canopy} material={looks.leaves} items={built.trees} colored />
      <Instanced geometry={shapes.pole} material={looks.steel} items={built.lamps} />
      <Instanced geometry={shapes.bulb} material={looks.glow} items={built.lamps} shadows={false} />
      <Instanced geometry={shapes.hydrant} material={looks.red} items={built.hydrants} />
      <Instanced geometry={shapes.seat} material={looks.wood} items={built.benches} />
      <Instanced geometry={shapes.back} material={looks.wood} items={built.benches} />

      <IssueLayer reducedMotion={reducedMotion} />
      <AddressPin />
      <StreetSigns signs={built.signs} />
      <Sparkles count={90} scale={CITY_SPAN} size={2.4} speed={0.16} color="#ffffff" opacity={0.45} />
    </group>
  );
}
