import { Sparkles } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import town from "../../../data/wellesley/town.geojson";
import { adoptPotholes, scatterPotholes, selectPothole, usePotholeFix } from "../../city/potholeFix";
import { detectIssues } from "../../../shared/issues.ts";
import { publishMap, type Bounds, type CityMap } from "../cityStore";
import { publishIssues } from "../issueStore";
import { createProjector, isFeatureCollection, type ShowcaseBBox } from "../geo";
import { INTERVENTION_EDGE_IDS, SHOWCASE_BBOX } from "../layout";
import { GLASS_TINTS, worldCurtainWall } from "./glass";
import { parseBasemap, type ParsedBasemap, type WayRibbon } from "./parseBasemap";
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
  return { parsed, kinds, bounds, project: projector.project };
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
  readonly bounds: Bounds;

  constructor(bounds: Bounds) {
    this.bounds = bounds;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / this.cell) + 1;
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / this.cell) + 1;
    this.data = new Uint8Array(this.cols * this.rows);
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
  garden: THREE.BufferGeometry;
  metal: THREE.BufferGeometry;
  stone: THREE.BufferGeometry;
  roads: THREE.BufferGeometry;
  lines: THREE.BufferGeometry;
  lit: THREE.BufferGeometry;
  walks: Record<"sidewalk" | "footway" | "path", THREE.BufferGeometry>;
  trees: Placement[];
  lamps: Placement[];
  hydrants: Placement[];
  benches: Placement[];
  holes: ReturnType<typeof scatterPotholes>;
  signs: SignSpot[];
};

function buildCity(model: CityModel): Built {
  const glass = GLASS_TINTS.map(() => new Bucket());
  const garden = new Bucket();
  const metal = new Bucket();
  const stone = new Bucket();
  const occupancy = new Occupancy(model.bounds);

  for (const building of model.parsed.buildings) {
    const ring = building.ring;
    if (ring.length < 3 || Math.abs(signedArea(ring)) < 0.05) continue;
    const kind = model.kinds.get(building.id) ?? "yes";
    const floors = (FLOORS[kind] ?? 5) + Math.floor(idHash(building.id) * 4);
    const top = PODIUM_H + floors * FLOOR_H;
    const tint = glass[Math.floor(idHash(building.id) * glass.length)] ?? glass[0]!;

    const podium = shrink(ring, 1.03);
    walls(stone, podium, 0, PODIUM_H);
    cap(stone, podium, PODIUM_H);
    walls(tint, ring, PODIUM_H, top);
    // Lower buildings carry roof gardens; towers finish in a glass crown.
    if (floors >= 9) {
      const crown = shrink(ring, 0.68);
      const crownTop = top + (2 + Math.floor(idHash(building.id) * 2)) * FLOOR_H;
      cap(metal, ring, top);
      walls(tint, crown, top, crownTop);
      cap(metal, crown, crownTop);
    } else {
      cap(garden, ring, top);
    }
    occupancy.markRing(ring, 0.9);
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

  // Trees on open lawn only.
  const trees: Placement[] = [];
  const { minX, maxX, minZ, maxZ } = model.bounds;
  const step = 2.6;
  for (let gx = minX; gx <= maxX; gx += step) {
    for (let gz = minZ; gz <= maxZ; gz += step) {
      const r = hash(gx, gz);
      if (r < 0.45) continue;
      const x = gx + (hash(gz, gx) - 0.5) * step;
      const z = gz + (hash(gx + 7, gz) - 0.5) * step;
      if (occupancy.taken(x, z)) continue;
      const palette = r > 0.9 ? AUTUMN : GREEN;
      trees.push({
        x,
        z,
        s: 0.75 + hash(x, z) * 0.6,
        color: palette[Math.floor(hash(z, x) * palette.length)] ?? GREEN[0],
      });
    }
  }

  const roadWays = model.parsed.ways.filter((way) => way.layer === "road");
  const lamps = roadWays.flatMap((way) => along(way.points, 7, WAY_HALF_WIDTH.road + 0.35));
  const hydrants = roadWays.flatMap((way) => along(way.points, 19, -(WAY_HALF_WIDTH.road + 0.3)));
  const benches = model.parsed.ways
    .filter((way) => way.layer === "footway")
    .flatMap((way) => along(way.points, 13, WAY_HALF_WIDTH.footway + 0.3));

  // Illustrative holes on this city's roads, not only a street named Central.
  const holes = scatterPotholes(roadWays);

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
    lamps,
    hydrants,
    benches,
    holes,
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
  return { bounds: model.bounds, roads: roads.join(""), walks: walks.join(""), buildings, streets, places };
}

/* —— Materials and shared shapes —— */

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

function Pothole({ id, x, z, size = 1 }: { id: string; x: number; z: number; size?: number }) {
  const fix = usePotholeFix();
  const patched = fix.patchedIds.includes(id);
  const selected = fix.selectedId === id;
  return (
    <group position={[x, 0.08, z]} scale={size}>
      <mesh rotation={[-Math.PI / 2, 0, 0.2]} raycast={() => null}>
        <circleGeometry args={[0.95, 8]} />
        <meshStandardMaterial
          color={patched ? "#d7fff4" : "#7af4ff"}
          emissive={patched ? "#9ee7d8" : "#7af4ff"}
          emissiveIntensity={patched ? 0.15 : 0.35}
        />
      </mesh>
      <mesh position={[0.05, 0.01, -0.04]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[patched ? 0.7 : 0.55, 7]} />
        <meshStandardMaterial color={patched ? "#9ad7c8" : "#062830"} roughness={1} />
      </mesh>
      {selected ? (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[1.05, 1.25, 20]} />
          <meshBasicMaterial color="#f7faf8" />
        </mesh>
      ) : null}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.06, 0]}
        onClick={(event) => {
          event.stopPropagation();
          selectPothole(id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <circleGeometry args={[1.4, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * The glass city. With no map it shows the Wellesley town; given a loaded
 * neighborhood (same FeatureCollection shape) it rebuilds from that.
 */
export function City({ geoJson }: { geoJson?: unknown }) {
  const { glass, surfaces } = useMaterials();
  const { shapes, looks } = useFurniture();
  const model = useMemo(() => (geoJson ? buildModel(geoJson) : TOWN), [geoJson]);
  const built = useMemo(() => buildCity(model), [model]);

  useLayoutEffect(() => {
    adoptPotholes(built.holes.map((hole) => hole.issue));
  }, [built]);
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
      <mesh geometry={built.stone} material={surfaces.stone} castShadow receiveShadow raycast={() => null} />
      <mesh geometry={built.garden} material={surfaces.garden} receiveShadow raycast={() => null} />
      <mesh geometry={built.metal} material={surfaces.metal} castShadow receiveShadow raycast={() => null} />

      <Instanced geometry={shapes.trunk} material={looks.bark} items={built.trees} />
      <Instanced geometry={shapes.canopy} material={looks.leaves} items={built.trees} colored />
      <Instanced geometry={shapes.pole} material={looks.steel} items={built.lamps} />
      <Instanced geometry={shapes.bulb} material={looks.glow} items={built.lamps} shadows={false} />
      <Instanced geometry={shapes.hydrant} material={looks.red} items={built.hydrants} />
      <Instanced geometry={shapes.seat} material={looks.wood} items={built.benches} />
      <Instanced geometry={shapes.back} material={looks.wood} items={built.benches} />

      {built.holes.map((spot) => (
        <Pothole key={spot.issue.id} id={spot.issue.id} x={spot.x} z={spot.z} size={0.38} />
      ))}

      <IssueLayer />
      <StreetSigns signs={built.signs} />
      <Sparkles count={90} scale={CITY_SPAN} size={2.4} speed={0.16} color="#ffffff" opacity={0.45} />
    </group>
  );
}
