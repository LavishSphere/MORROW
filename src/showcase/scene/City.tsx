import { Sparkles } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import town from "../../../data/wellesley/town.geojson";
import waterMap from "../../../data/wellesley/water.geojson";
import { DEFAULT_HEIGHT_METRES, withOvertureBuildings, type OvertureFootprint } from "../../data/buildingHeight.ts";
import { fetchOvertureBuildings } from "../../data/overtureBuildings.ts";
import { detectIssues } from "../../../shared/issues.ts";
import { publishMap, type Bounds, type CityMap } from "../cityStore";
import { publishIssues } from "../issueStore";
import { oceanPolygons, stitchCoast } from "./coastline.ts";
import { createProjector, isFeatureCollection, type ShowcaseBBox } from "../geo";
import { INTERVENTION_EDGE_IDS, SHOWCASE_BBOX } from "../layout";
import { GLASS_TINTS, worldCurtainWall } from "./glass";
import { parseBasemap, type ParsedBasemap, type WayRibbon } from "./parseBasemap";
import { AddressPin } from "./AddressPin";
import { IssueLayer } from "./IssueLayer";
import { StreetSigns, type SignSpot } from "./StreetSigns";
import { Traffic } from "./Traffic";
import { buildTrafficLanes, carLaneOffset, CAR_HALF_WIDTH, FootprintGrid, type TrafficLanes } from "./trafficLanes.ts";
import { useStreetImprovements } from "../../city/streetImprovements";

/**
 * Wellesley, reimagined. Every building, road, and footpath comes from
 * OpenStreetMap at its true position and outline: by default the wider
 * town extract in data/wellesley/town.geojson (College, Wellesley Square,
 * and the streets around them), or a loaded US city. Lakes, ponds, and
 * brooks come from the same map. That water is the shoreline, not a defect.
 * Buildings are the Overture 2026-11-18.0 footprints extruded to a measured
 * height: that feature's height, then the OSM height tag, then levels times
 * 3 m. A roof is added only when roof:shape is present. Microsoft imagery
 * heights are not used. Streets keep their existing ribbon widths.
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
  /** All OpenStreetMap tags per building id (height, roof shape, colour…). */
  tags: Map<string, Record<string, unknown>>;
  /** building:part pieces: the real 3D shape of detailed landmarks. */
  parts: Part[];
};

type Part = { id: string; ring: Ring; tags: Record<string, unknown> };

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
  const parsed = parseBasemap(geoJson, projector) ?? {
    buildings: [],
    ways: [],
    water: [],
    waterways: [],
    coastlines: [],
  };
  const kinds = new Map<string, string>();
  const tags = new Map<string, Record<string, unknown>>();
  const parts: Part[] = [];
  if (isFeatureCollection(geoJson)) {
    for (const feature of geoJson.features) {
      const props = (feature as { properties?: Record<string, unknown> }).properties;
      if (props?.layer === "building") {
        kinds.set(String(props.osmId), String(props.building ?? "yes"));
        tags.set(String(props.osmId), props);
      } else if (props?.layer === "building_part") {
        const coords = (feature as { geometry?: { coordinates?: unknown } }).geometry?.coordinates;
        const outer = Array.isArray(coords) ? (coords[0] as unknown) : null;
        if (!Array.isArray(outer)) continue;
        const ring: (readonly [number, number])[] = [];
        for (const pt of outer) {
          if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
            ring.push(projector.project(pt[0], pt[1]));
          }
        }
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first && last && first[0] === last[0] && first[1] === last[1]) ring.pop();
        if (ring.length >= 3) parts.push({ id: String(props.osmId), ring, tags: props });
      }
    }
  }
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const rings = [
    ...parsed.buildings.map((b) => b.ring),
    ...parsed.water.map((body) => body.ring),
    ...(parsed.buildings.length === 0 ? parsed.ways.map((w) => w.points) : []),
  ];
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
    tags,
    parts,
    project: projector.project,
    unproject: (x: number, z: number) => {
      const [lon0, lat0] = bbox.center;
      const metersPerDegLon = 111_320 * Math.max(0.2, Math.cos((lat0 * Math.PI) / 180));
      return [lon0 + x / (CITY_SCALE * metersPerDegLon), lat0 - z / (CITY_SCALE * 111_320)] as const;
    },
    geoBounds: { west: box.west, south: box.south, east: box.east, north: box.north },
  };
}

/** The Wellesley town extract plus its mapped water, centered on the College. */
const TOWN_GEOJSON = {
  type: "FeatureCollection" as const,
  features: [
    ...(town as { features: unknown[] }).features,
    ...(waterMap as { features: unknown[] }).features,
  ],
};

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

/** A flat roof over a footprint. A fan covers a ring earcut cannot triangulate. */
function cap(bucket: Bucket, ring: Ring, y: number) {
  const fan = () => {
    const [cx, cz] = centroid(ring);
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a && b) bucket.up(a, b, [cx, cz], y);
    }
  };
  try {
    const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    if (faces.length === 0) {
      fan();
      return;
    }
    for (const [i, j, k] of faces) {
      const a = ring[i!];
      const b = ring[j!];
      const c = ring[k!];
      if (a && b && c) bucket.up(a, b, c, y);
    }
  } catch {
    fan();
  }
}

/**
 * The sea from mapped coastline. Inside a box a little past the city, the
 * water side of the shore is traced into real polygons (islands as holes).
 * If the download stopped partway along a shore, a narrow strip on the water
 * side is drawn instead: a hint of the shoreline, never a flood.
 */
function ocean(bucket: Bucket, lines: Ring[], bounds: Bounds, y: number) {
  const span = Math.max(80, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  // Try a box well past the city edge, then one just around it.
  for (const pad of [span * 1.5, span * 0.08]) {
    const rect = {
      minX: bounds.minX - pad,
      maxX: bounds.maxX + pad,
      minZ: bounds.minZ - pad,
      maxZ: bounds.maxZ + pad,
    };
    const { polygons, complete } = oceanPolygons(lines, rect);
    if (!complete) continue;
    for (const polygon of polygons) fill(bucket, polygon.outer, polygon.holes, y);
    return;
  }
  for (const coast of stitchCoast(lines)) shoreBand(bucket, coast, SHORE_FALLBACK, y);
}

/** About 40 m of water along a shore whose other pieces were not downloaded. */
const SHORE_FALLBACK = 6;

/** A flat polygon with holes, triangulated once. */
function fill(bucket: Bucket, outer: Ring, holes: Ring[], y: number) {
  try {
    const contour = outer.map(([x, z]) => new THREE.Vector2(x, z));
    const holeRings = holes.map((hole) => hole.map(([x, z]) => new THREE.Vector2(x, z)));
    const faces = THREE.ShapeUtils.triangulateShape(contour, holeRings);
    // triangulateShape drops a repeated closing point, so index the arrays after it ran.
    const all = [contour, ...holeRings].flat();
    for (const [i, j, k] of faces) {
      const a = all[i!];
      const b = all[j!];
      const c = all[k!];
      if (a && b && c) bucket.up([a.x, a.y], [b.x, b.y], [c.x, c.y], y);
    }
  } catch {
    // A self-crossing shore cannot be triangulated; leave that piece dry.
  }
}

/**
 * OSM coastline keeps water on the right. A strip of `width` on that side,
 * used only when the shore could not be traced into a polygon.
 */
function shoreBand(bucket: Bucket, points: Ring, width: number, y: number) {
  const clean = points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1]) > 1e-4,
  );
  if (clean.length < 2 || width <= 0) return;
  const edge: [number, number][] = [];
  const waterSide: [number, number][] = [];
  for (let i = 0; i < clean.length; i += 1) {
    const prev = clean[Math.max(0, i - 1)]!;
    const next = clean[Math.min(clean.length - 1, i + 1)]!;
    const here = clean[i]!;
    const inLen = Math.hypot(here[0] - prev[0], here[1] - prev[1]) || 1;
    const outLen = Math.hypot(next[0] - here[0], next[1] - here[1]) || 1;
    // Right of travel in this x-east, z-south frame: (-dz, dx).
    const r1x = i === 0 ? -(next[1] - here[1]) / outLen : -(here[1] - prev[1]) / inLen;
    const r1z = i === 0 ? (next[0] - here[0]) / outLen : (here[0] - prev[0]) / inLen;
    const r2x = i === clean.length - 1 ? r1x : -(next[1] - here[1]) / outLen;
    const r2z = i === clean.length - 1 ? r1z : (next[0] - here[0]) / outLen;
    let mx = r1x + r2x;
    let mz = r1z + r2z;
    const mLen = Math.hypot(mx, mz) || 1;
    mx /= mLen;
    mz /= mLen;
    const w = width * Math.min(2.5, 1 / Math.max(0.2, mx * r1x + mz * r1z));
    edge.push([here[0], here[1]]);
    waterSide.push([here[0] + mx * w, here[1] + mz * w]);
  }
  for (let i = 0; i < clean.length - 1; i += 1) {
    bucket.up(edge[i]!, edge[i + 1]!, waterSide[i]!, y);
    bucket.up(waterSide[i]!, edge[i + 1]!, waterSide[i + 1]!, y);
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

/**
 * Centerline half-widths in scene units. CITY_SCALE is 0.14 scene units
 * per real meter, so a river reads at about 36 m and a stream at about 6 m.
 */
const RIVER_HALF = 2.5;
const STREAM_HALF = 0.42;

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

/* —— Proposed street improvements —— */

/** Proposed props glow with a ring so they read as additions, not existing furniture. */
const PROPOSED_RING = "#f7ffff";
const TRASH_BODY = "#5b6f78";
const TRASH_GLOW = "#c9f6ff";
const RECYCLE_BODY = "#2fa58a";
const RECYCLE_GLOW = "#7dffd8";

type ProposedSpots = {
  /** Litter bins beside benches (rest points) and at curbs near crossings. */
  garbage: Placement[];
  /** Waste stations that recycling pairs with. */
  stations: Placement[];
  benches: Placement[];
  lamps: Placement[];
};

/** Distance from a bench to the litter bin beside it. */
const BENCH_BIN_STEP = 0.55;
/** Recycling sits just down the street from the waste station it pairs with. */
const RECYCLE_PAIR_STEP = 0.28;

/** Move a spot `dist` along its heading. */
function stepAlong(spot: Placement, dist: number): Placement {
  const rot = spot.rot ?? 0;
  return { x: spot.x + Math.sin(rot) * dist, z: spot.z + Math.cos(rot) * dist, rot };
}

/* —— Build everything once per map —— */

type Placement = { x: number; z: number; rot?: number; s?: number; color?: string };

type Built = {
  glass: THREE.BufferGeometry[];
  /** Real 3D landmark pieces in their mapped colours. */
  masonry: { color: string; geometry: THREE.BufferGeometry }[];
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
  /** Parked cars at the curb, out of the moving lanes. */
  cars: Placement[];
  /** Standing people; `color` is the shirt. Skin and trousers share their spots. */
  people: Placement[];
  peopleSkin: Placement[];
  peoplePants: Placement[];
  /** Lanes for moving cars and walking people, drawn only when zoomed in. */
  traffic: TrafficLanes;
  lamps: Placement[];
  hydrants: Placement[];
  benches: Placement[];
  /** Spots for the street improvements a proposal can add. */
  proposed: ProposedSpots;
  signs: SignSpot[];
  water: THREE.BufferGeometry;
  streams: THREE.BufferGeometry;
};

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

/* —— Real 3D shapes from OpenStreetMap (Simple 3D Buildings) —— */

/** Real metres → scene units, with the same ~1.5× height boost the city uses. */
const REAL_TO_SCENE = 0.14 * 1.5;
const METRES_PER_LEVEL = 3;

/** "443.2", "75 m" → number; anything else → null. */
function metres(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** Real top and bottom in metres, if the mapper recorded them. */
function realHeights(tags: Record<string, unknown>) {
  const levels = metres(tags["building:levels"]);
  const minLevel = metres(tags["building:min_level"]);
  const top = metres(tags.height) ?? (levels !== null ? levels * METRES_PER_LEVEL : null);
  if (top === null || top <= 0) return null;
  const bottom = metres(tags.min_height) ?? (minLevel !== null ? minLevel * METRES_PER_LEVEL : 0);
  return { top, bottom: Math.min(bottom, top - 0.5) };
}

/** Typical colours for a mapped material when no colour was recorded. */
const MATERIAL_COLORS: Record<string, string> = {
  stone: "#c9bc9c",
  limestone: "#d4c7a6",
  sandstone: "#c8a57a",
  granite: "#9c958d",
  concrete: "#b7b3aa",
  metal: "#9aa3ab",
  steel: "#9aa3ab",
  wood: "#9c7653",
  plaster: "#e2d6c2",
};

/**
 * "glass" for glass, a hex colour from building:colour or a known material,
 * or null when the mapper recorded neither (then the city's glass look is used).
 */
function facade(tags: Record<string, unknown>): string | null {
  const material = String(tags["building:material"] ?? "").toLowerCase();
  if (material === "glass") return "glass";
  const raw = tags["building:colour"];
  if (typeof raw === "string" && raw.trim()) {
    const color = new THREE.Color();
    try {
      color.setStyle(raw.trim());
      return `#${color.getHexString()}`;
    } catch {
      // Unknown colour name: fall back to the material.
    }
  }
  return MATERIAL_COLORS[material] ?? null;
}

/** Walls whose top height can differ at each corner (sloped roofs). */
function wallsTo(bucket: Bucket, ring: Ring, y0: number, topAt: (i: number) => number) {
  const outward = signedArea(ring) > 0;
  let u = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[j]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-5) continue;
    const A0: Point3 = [ax, y0, az];
    const B0: Point3 = [bx, y0, bz];
    const B1: Point3 = [bx, topAt(j), bz];
    const A1: Point3 = [ax, topAt(i), az];
    if (outward) {
      tri(bucket, A0, B1, B0);
      tri(bucket, A0, A1, B1);
    } else {
      tri(bucket, A0, B0, B1);
      tri(bucket, A0, B1, A1);
    }
    u += len;
  }
  return u;
}

/** A slanted band between two rings (domes taper in steps). */
function band(bucket: Bucket, lower: Ring, y0: number, upper: Ring, y1: number) {
  const outward = signedArea(lower) > 0;
  for (let i = 0; i < lower.length; i += 1) {
    const j = (i + 1) % lower.length;
    const A0: Point3 = [lower[i]![0], y0, lower[i]![1]];
    const B0: Point3 = [lower[j]![0], y0, lower[j]![1]];
    const B1: Point3 = [upper[j]![0], y1, upper[j]![1]];
    const A1: Point3 = [upper[i]![0], y1, upper[i]![1]];
    if (outward) {
      tri(bucket, A0, B1, B0);
      tri(bucket, A0, A1, B1);
    } else {
      tri(bucket, A0, B0, B1);
      tri(bucket, A0, B1, A1);
    }
  }
}

/** An upward-facing roof over a ring with a height per corner. */
function slopedCap(bucket: Bucket, ring: Ring, heightAt: (i: number) => number) {
  const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const a: Point3 = [ring[i!]![0], heightAt(i!), ring[i!]![1]];
    let b: Point3 = [ring[j!]![0], heightAt(j!), ring[j!]![1]];
    let c: Point3 = [ring[k!]![0], heightAt(k!), ring[k!]![1]];
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny < 0) [b, c] = [c, b];
    tri(bucket, a, b, c);
  }
}

/**
 * One real 3D piece: walls from its bottom to the roof line, then the
 * mapped roof shape. `center` is the whole building's middle, which sloped
 * crowns rise toward.
 */
function drawPiece(wall: Bucket, roof: Bucket, ring: Ring, tags: Record<string, unknown>, center: readonly [number, number]) {
  const h = realHeights(tags);
  if (!h) return 0;
  const y0 = h.bottom * REAL_TO_SCENE;
  const yTop = Math.max(y0 + 0.05, h.top * REAL_TO_SCENE);
  const shape = String(tags["roof:shape"] ?? "").trim().toLowerCase() || "flat";
  // A roof taller than a quarter of the piece is almost always a mapping slip.
  const roofH = shape === "flat" ? 0 : Math.min((yTop - y0) * 0.25, (metres(tags["roof:height"]) ?? 6) * REAL_TO_SCENE);
  const base = yTop - roofH;

  if (shape === "skillion") {
    // Corners nearest the building's middle are highest: a tapered crown.
    const d = ring.map(([x, z]) => Math.hypot(x - center[0], z - center[1]));
    const near = Math.min(...d);
    const far = Math.max(...d);
    const at = (i: number) => base + roofH * (far - near > 1e-4 ? 1 - (d[i]! - near) / (far - near) : 1);
    wallsTo(wall, ring, y0, at);
    slopedCap(roof, ring, at);
  } else if (shape === "dome" || shape === "onion" || shape === "round") {
    walls(wall, ring, y0, base);
    let lower = ring;
    let yLower = base;
    for (let k = 1; k <= 4; k += 1) {
      const t = (k / 4) * (Math.PI / 2);
      const upper = shrink(ring, Math.max(0.05, Math.cos(t)));
      const yUpper = base + roofH * Math.sin(t);
      band(roof, lower, yLower, upper, yUpper);
      lower = upper;
      yLower = yUpper;
    }
    cap(roof, lower, yLower);
  } else if (shape !== "flat") {
    // Pyramidal, hipped, gabled…: all rise to a point over the middle.
    walls(wall, ring, y0, base);
    const [cx, cz] = centroid(ring);
    const apex: Point3 = [cx, yTop, cz];
    const up = signedArea(ring) > 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a: Point3 = [ring[i]![0], base, ring[i]![1]];
      const b: Point3 = [ring[(i + 1) % ring.length]![0], base, ring[(i + 1) % ring.length]![1]];
      if (up) tri(roof, b, a, apex);
      else tri(roof, a, b, apex);
    }
  } else {
    walls(wall, ring, y0, yTop);
    cap(roof, ring, yTop);
  }
  return yTop;
}

function buildCity(model: CityModel): Built {
  const glass = GLASS_TINTS.map(() => new Bucket());
  const siding = SIDING.map(() => new Bucket());
  const shingles = SHINGLE.map(() => new Bucket());
  const garden = new Bucket();
  const metal = new Bucket();
  const stone = new Bucket();
  const occupancy = new Occupancy(model.bounds);

  // Real 3D landmarks: masonry buckets by mapped colour; glass uses the tints.
  const masonry = new Map<string, Bucket>();
  const surface = (tags: Record<string, unknown>, key: string) => {
    const look = facade(tags);
    // No colour or material recorded: the city's usual tinted glass, not blank white.
    if (look === "glass" || look === null) return glass[Math.floor(idHash(key) * glass.length)] ?? glass[0]!;
    let bucket = masonry.get(look);
    if (!bucket) {
      bucket = new Bucket();
      masonry.set(look, bucket);
    }
    return bucket;
  };
  // Which building each 3D piece belongs to (the piece's middle is inside it).
  const piecesOf = new Map<string, Part[]>();
  const orphanPieces: Part[] = [];
  for (const part of model.parts) {
    const [px, pz] = centroid(part.ring);
    const owner = model.parsed.buildings.find((b) => insideRing(px, pz, b.ring));
    if (owner) piecesOf.set(owner.id, [...(piecesOf.get(owner.id) ?? []), part]);
    else orphanPieces.push(part);
  }
  for (const part of orphanPieces) {
    const peak = drawPiece(surface(part.tags, part.id), metal, part.ring, part.tags, centroid(part.ring));
    if (peak > 0) occupancy.markHeight(part.ring, peak);
  }

  for (const building of model.parsed.buildings) {
    const ring = building.ring;
    if (ring.length < 3 || Math.abs(signedArea(ring)) < 0.05) continue;
    const own = model.tags.get(building.id) ?? {};
    const pieces = piecesOf.get(building.id);
    // Dense downtowns can hit the download quota partway through a
    // landmark. If its pieces stop well short of its own recorded height,
    // they are incomplete: draw the whole building at that height instead.
    const ownTop = realHeights(own)?.top ?? 0;
    const piecesTop = Math.max(0, ...(pieces ?? []).map((piece) => realHeights({ ...own, ...piece.tags })?.top ?? 0));
    const complete = piecesTop >= ownTop * 0.9;
    if (pieces && complete && pieces.some((piece) => realHeights(piece.tags))) {
      // A detailed landmark: draw its mapped 3D pieces, not the outline.
      const middle = centroid(ring);
      let peak = 0;
      for (const piece of pieces) {
        const tags = { ...own, ...piece.tags };
        peak = Math.max(peak, drawPiece(surface(tags, piece.id), metal, piece.ring, tags, middle));
      }
      occupancy.markRing(ring, 0.9);
      occupancy.markHeight(ring, peak);
      continue;
    }
    // No recorded height (the raw map before Overture arrives): the plain default, not a gap.
    const real = realHeights(own) ?? { top: DEFAULT_HEIGHT_METRES, bottom: 0 };
    const shape = String(own["roof:shape"] ?? "").trim().toLowerCase();
    if ((shape && shape !== "flat") || facade(own) !== null) {
      // The mapper recorded its real height and look: use them, not a guess.
      const peak = drawPiece(surface(own, building.id), metal, ring, own, centroid(ring));
      occupancy.markRing(ring, 0.9);
      occupancy.markHeight(ring, peak);
      continue;
    }
    // Glass extrusion of the footprint. No extra floors, and no roof unless roof:shape was set above.
    const top = Math.max(PODIUM_H + 0.08, real.top * REAL_TO_SCENE);
    const tint = glass[Math.floor(idHash(`${building.id}c`) * glass.length)] ?? glass[0]!;
    const podium = shrink(ring, 1.03);
    walls(stone, podium, 0, PODIUM_H);
    cap(stone, podium, PODIUM_H);
    walls(tint, ring, PODIUM_H, top);
    cap(metal, ring, top);
    occupancy.markRing(ring, 0.9);
    occupancy.markHeight(ring, top);
  }

  // Shorelines stay clear of trees. The water is the map, not a barrier.
  // Lakes sit just above the lawn and under the roads.
  const water = new Bucket();
  for (const body of model.parsed.water) {
    if (body.ring.length < 3) continue;
    cap(water, body.ring, 0.025);
    occupancy.markRing(body.ring, 0.3);
  }
  // The sea runs past the city edge on the water side only, so looking
  // outward shows ocean instead of stopping at the streets. Not a wall.
  const coastLines = model.parsed.coastlines.map((line) => line.points);
  ocean(water, coastLines, model.bounds, 0.02);
  for (const coast of coastLines) occupancy.markLine(coast, 1.2);
  const streams = new Bucket();
  for (const brook of model.parsed.waterways) {
    const half = brook.wide ? RIVER_HALF : STREAM_HALF;
    strip(streams, brook.points, half, 0.035);
    occupancy.markLine(brook.points, half + 0.12);
  }

  const roads = new Bucket();
  const lines = new Bucket();
  const lit = new Bucket();
  const walks = { sidewalk: new Bucket(), footway: new Bucket(), path: new Bucket() };
  for (const way of model.parsed.ways) {
    const half = way.halfWidth;
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
  // Mapped lakes and brooks are the only water. These ovals are not.
  const pondTarget = 0;
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
  const SKINS = ["#f1c9a5", "#e0ac83", "#c68a5e", "#a0673f", "#7a4a2a", "#5b3a24"];
  const PANTS = ["#2d3a4f", "#3b4552", "#1f2328", "#6b5a45", "#4a5f7a", "#8a8f96"];
  // Nobody stands or parks inside a building: one coarse grid of footprints, built once.
  const footprints = new FootprintGrid([
    ...model.parsed.buildings.map((b) => b.ring),
    ...model.parts.map((part) => part.ring),
  ]);
  // Parked cars sit at the curb: in drive aisles and driveways (no moving
  // traffic there), and on streets wide enough that the moving lane clears them.
  const cars: Placement[] = [];
  for (const way of model.parsed.ways) {
    if (way.indoor) continue;
    const service = way.highway === "service";
    if (!service && way.layer !== "road") continue;
    const curb = Math.max(0, way.halfWidth - 0.2);
    if (!service && curb - carLaneOffset(way) < 2 * CAR_HALF_WIDTH - 0.04) continue;
    const origin = way.points[0] ?? [0, 0];
    const side = hash(origin[0], origin[1]) > 0.5 ? 1 : -1;
    for (const spot of along(way.points, 8, side * curb)) {
      if (cars.length >= 160 || hash(spot.x, spot.z) < 0.6) continue;
      if (footprints.inside(spot.x, spot.z)) continue;
      cars.push({
        ...spot,
        // Local +X is the nose. `along` stores a heading whose long axis sits across the lane.
        rot: spot.rot - Math.PI / 2 + (side < 0 ? Math.PI : 0),
        color: CAR_COLORS[Math.floor(hash(spot.z, spot.x) * CAR_COLORS.length)] ?? CAR_COLORS[0],
      });
    }
  }
  const people: Placement[] = [];
  const outdoors = (x: number, z: number) => !footprints.inside(x, z);
  for (const way of model.parsed.ways) {
    if (way.layer !== "sidewalk" && way.layer !== "footway") continue;
    // Drive aisles hold parked cars; corridors, tunnels, and covered ways are indoors.
    if (way.indoor || way.highway === "service" || way.highway === "corridor") continue;
    for (const spot of along(way.points, 4.2, 0)) {
      if (people.length >= 460 || hash(spot.x + 2, spot.z) < 0.52) continue;
      if (!outdoors(spot.x, spot.z)) continue;
      people.push({
        ...spot,
        // Face along the path, either way.
        rot: spot.rot - Math.PI / 2 + (hash(spot.z, spot.x + 5) > 0.5 ? Math.PI : 0),
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
      const x = park.x + Math.cos(angle) * dist;
      const z = park.z + Math.sin(angle) * dist;
      if (!outdoors(x, z)) continue;
      people.push({
        x,
        z,
        rot: angle,
        color: SHIRTS[Math.floor(hash(park.x + i, park.z + 4) * SHIRTS.length)] ?? SHIRTS[0],
      });
    }
  }
  const peopleSkin = people.map((p) => ({ ...p, color: SKINS[Math.floor(hash(p.x + 3, p.z) * SKINS.length)] ?? SKINS[0] }));
  const peoplePants = people.map((p) => ({ ...p, color: PANTS[Math.floor(hash(p.x, p.z + 9) * PANTS.length)] ?? PANTS[0] }));
  const traffic = buildTrafficLanes(model.parsed.ways, footprints);
  const lamps = roadWays.flatMap((way) => along(way.points, 7, WAY_HALF_WIDTH.road + 0.35));
  const hydrants = roadWays.flatMap((way) => along(way.points, 19, -(WAY_HALF_WIDTH.road + 0.3)));
  const benches = model.parsed.ways
    .filter((way) => way.layer === "footway")
    .flatMap((way) => along(way.points, 13, WAY_HALF_WIDTH.footway + 0.3));

  // Proposed street improvements: cans beside benches and at curbs, recycling
  // paired with those stations, extra benches and lamps along footways.
  const footWays = model.parsed.ways.filter((way) => way.layer === "footway");
  const curbBins = roadWays.flatMap((way) => along(way.points, 23, -(WAY_HALF_WIDTH.road + 0.45)));
  const garbageSpots = [...benches.map((bench) => stepAlong(bench, BENCH_BIN_STEP)), ...curbBins];
  const proposed: ProposedSpots = {
    garbage: garbageSpots,
    stations: garbageSpots,
    benches: footWays
      .flatMap((way) => along(way.points, 13, -(WAY_HALF_WIDTH.footway + 0.3)))
      .map((spot) => ({ ...spot, rot: spot.rot + Math.PI })),
    lamps: footWays.flatMap((way) => along(way.points, 9, WAY_HALF_WIDTH.footway + 0.35)),
  };

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
    masonry: [...masonry].map(([color, bucket]) => ({ color, geometry: bucket.geometry() })),
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
    peopleSkin,
    peoplePants,
    traffic,
    water: water.geometry(),
    streams: streams.geometry(),
    lamps,
    hydrants,
    benches,
    proposed,
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
  const water = [
    ...model.parsed.water.map((body) => `${line(body.ring)}Z`),
    ...model.parsed.waterways.map((brook) => line(brook.points)),
    ...model.parsed.coastlines.map((coast) => line(coast.points)),
  ].join("");
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
    water,
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
          color: "#1a6e96",
          roughness: 0.35,
          metalness: 0.08,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
        stream: new THREE.MeshStandardMaterial({
          color: "#2a86ae",
          roughness: 0.4,
          metalness: 0.05,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
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

/**
 * A low-poly person facing +X, in three parts so each takes its own instance
 * colour: torso and sleeves (shirt), head and hands (skin), legs (trousers).
 * Each vertex carries `aSwing` = (swing amount, pivot height). Walkers swing
 * arms and legs about the hip and shoulder; standing people ignore it.
 */
function limbs(parts: [THREE.BufferGeometry, number, number][]) {
  const swing: number[] = [];
  for (const [geo, amount, pivot] of parts) {
    for (let i = 0; i < geo.getAttribute("position").count; i += 1) swing.push(amount, pivot + PERSON_LIFT);
  }
  const merged = mergeGeos(parts.map(([geo]) => geo)).translate(0, PERSON_LIFT, 0);
  merged.setAttribute("aSwing", new THREE.Float32BufferAttribute(swing, 2));
  return merged;
}

/** Feet stand on the path surface, not in it. */
const PERSON_LIFT = 0.04;
const HIP = 0.25;
const SHOULDER = 0.435;

function personParts() {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const torso = new THREE.CylinderGeometry(0.074, 0.058, 0.2, 7).scale(0.62, 1, 1).translate(0, 0.35, 0);
  return {
    body: limbs([
      [torso, 0, 0],
      [box(0.042, 0.18, 0.042, 0, 0.35, 0.097), -0.8, SHOULDER],
      [box(0.042, 0.18, 0.042, 0, 0.35, -0.097), 0.8, SHOULDER],
    ]),
    head: limbs([
      [new THREE.SphereGeometry(0.062, 8, 6).translate(0.004, 0.52, 0), 0, 0],
      [box(0.036, 0.036, 0.036, 0, 0.244, 0.097), -0.8, SHOULDER],
      [box(0.036, 0.036, 0.036, 0, 0.244, -0.097), 0.8, SHOULDER],
    ]),
    legs: limbs([
      [box(0.056, 0.24, 0.058, 0, 0.13, 0.036), 1, HIP],
      [box(0.056, 0.24, 0.058, 0, 0.13, -0.036), -1, HIP],
      [box(0.08, 0.024, 0.06, 0.012, 0.012, 0.036), 1, HIP],
      [box(0.08, 0.024, 0.06, 0.012, 0.012, -0.036), -1, HIP],
    ]),
  };
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
        ...personParts(),
        canBody: at(new THREE.CylinderGeometry(0.09, 0.08, 0.32, 10), 0.16),
        canBand: at(new THREE.CylinderGeometry(0.092, 0.092, 0.03, 10), 0.24),
        canLid: at(new THREE.CylinderGeometry(0.075, 0.1, 0.04, 10), 0.34),
        ring: at(new THREE.RingGeometry(0.9, 1, 24).rotateX(-Math.PI / 2), 0.03),
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
        skin: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
        pants: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
        trashBody: new THREE.MeshStandardMaterial({
          color: TRASH_BODY,
          emissive: TRASH_GLOW,
          emissiveIntensity: 0.18,
          roughness: 0.5,
        }),
        trashGlow: new THREE.MeshStandardMaterial({
          color: TRASH_GLOW,
          emissive: TRASH_GLOW,
          emissiveIntensity: 1.2,
          toneMapped: false,
        }),
        trashLid: new THREE.MeshStandardMaterial({ color: "#eef8fb", roughness: 0.4 }),
        recycleBody: new THREE.MeshStandardMaterial({
          color: RECYCLE_BODY,
          emissive: RECYCLE_GLOW,
          emissiveIntensity: 0.18,
          roughness: 0.5,
        }),
        recycleGlow: new THREE.MeshStandardMaterial({
          color: RECYCLE_GLOW,
          emissive: RECYCLE_GLOW,
          emissiveIntensity: 1.2,
          toneMapped: false,
        }),
        recycleLid: new THREE.MeshStandardMaterial({ color: "#e9fff7", roughness: 0.4 }),
        proposedRing: new THREE.MeshBasicMaterial({
          color: PROPOSED_RING,
          transparent: true,
          opacity: 0.85,
          toneMapped: false,
        }),
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

type Furniture = ReturnType<typeof useFurniture>;

/** A glowing ring under each proposed prop; `size` scales the unit ring. */
function ProposedRings({ furniture, items, size }: { furniture: Furniture; items: Placement[]; size: number }) {
  const rings = useMemo(() => items.map((item) => ({ x: item.x, z: item.z, s: size })), [items, size]);
  return (
    <Instanced geometry={furniture.shapes.ring} material={furniture.looks.proposedRing} items={rings} shadows={false} />
  );
}

/** Proposed garbage or recycling cans: slate or green body, glowing band, light lid, ring. */
function ProposedCans({ furniture, items, kind }: { furniture: Furniture; items: Placement[]; kind: "garbage" | "recycling" }) {
  const { shapes, looks } = furniture;
  const recycling = kind === "recycling";
  return (
    <group name={`proposed-${kind}`}>
      <Instanced geometry={shapes.canBody} material={recycling ? looks.recycleBody : looks.trashBody} items={items} />
      <Instanced geometry={shapes.canBand} material={recycling ? looks.recycleGlow : looks.trashGlow} items={items} shadows={false} />
      <Instanced geometry={shapes.canLid} material={recycling ? looks.recycleLid : looks.trashLid} items={items} />
      <ProposedRings furniture={furniture} items={items} size={0.17} />
    </group>
  );
}

/** Shows the street improvements selected for the proposal as glowing additions. */
function ProposedStreetImprovements({ furniture, spots }: { furniture: Furniture; spots: ProposedSpots }) {
  const { selectedIds } = useStreetImprovements();
  const garbage = selectedIds.includes("add-garbage-cans");
  const recycling = selectedIds.includes("add-recycling");
  const benches = selectedIds.includes("add-benches");
  const lighting = selectedIds.includes("add-better-lighting");
  const recyclingSpots = useMemo(
    () => spots.stations.map((station) => stepAlong(station, RECYCLE_PAIR_STEP)),
    [spots],
  );
  if (!garbage && !recycling && !benches && !lighting) return null;
  const { shapes, looks } = furniture;
  return (
    <group name="proposed-street-improvements">
      {garbage ? <ProposedCans kind="garbage" furniture={furniture} items={spots.garbage} /> : null}
      {recycling ? <ProposedCans kind="recycling" furniture={furniture} items={recyclingSpots} /> : null}
      {benches ? (
        <group name="proposed-benches">
          <Instanced geometry={shapes.seat} material={looks.wood} items={spots.benches} />
          <Instanced geometry={shapes.back} material={looks.wood} items={spots.benches} />
          <ProposedRings furniture={furniture} items={spots.benches} size={0.42} />
        </group>
      ) : null}
      {lighting ? (
        <group name="proposed-lamps">
          <Instanced geometry={shapes.pole} material={looks.steel} items={spots.lamps} />
          <Instanced geometry={shapes.bulb} material={looks.glow} items={spots.lamps} shadows={false} />
          <ProposedRings furniture={furniture} items={spots.lamps} size={0.2} />
        </group>
      ) : null}
    </group>
  );
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
  const furniture = useFurniture();
  const { shapes, looks } = furniture;
  const source = geoJson ?? TOWN_GEOJSON;
  const box = bboxOf(source);
  const boxKey = box
    ? `${box.west.toFixed(5)},${box.south.toFixed(5)},${box.east.toFixed(5)},${box.north.toFixed(5)}`
    : "";
  // Footprints from the last Overture download. When the city grows by a
  // tile they stay in use (those inside the new box) while the bigger box
  // downloads, so the buildings already on screen do not drop out.
  const [overture, setOverture] = useState<OvertureFootprint[]>([]);
  useEffect(() => {
    const box = bboxOf(source);
    if (!box) return;
    let cancelled = false;
    fetchOvertureBuildings({ west: box.west, south: box.south, east: box.east, north: box.north })
      .then((footprints) => {
        // An empty list means the extract could not be read: keep what we have.
        if (!cancelled && footprints.length > 0) setOverture(footprints);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boxKey, source]);
  const enriched = useMemo(() => {
    const here = bboxOf(source);
    // Footprints from another place (a different city was loaded) are dropped.
    const footprints = here
      ? overture.filter((f) => {
          const [lon, lat] = f.ring[0] ?? [NaN, NaN];
          return lon >= here.west && lon <= here.east && lat >= here.south && lat <= here.north;
        })
      : [];
    return withOvertureBuildings(source, footprints);
  }, [source, overture]);
  const cityModel = useMemo(
    () => buildModel(enriched, geoJson ? undefined : SHOWCASE_BBOX.center),
    [enriched, geoJson],
  );
  const built = useMemo(() => buildCity(cityModel), [cityModel]);
  const masonryLooks = useMemo(
    () =>
      built.masonry.map(
        ({ color }) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, side: THREE.DoubleSide }),
      ),
    [built],
  );
  useEffect(
    () => () => {
      for (const material of masonryLooks) material.dispose();
    },
    [masonryLooks],
  );

  useEffect(() => publishMap(mapFor(cityModel)), [cityModel]);
  // Accessibility issues from the map's own OpenStreetMap tags.
  useEffect(() => {
    const source = geoJson ?? town;
    const issues = detectIssues(source).map((issue) => {
      const [x, z] = cityModel.project(issue.point[0], issue.point[1]);
      const path = issue.line.map(([lon, lat]) => {
        const [px, pz] = cityModel.project(lon, lat);
        return [px, pz] as [number, number];
      });
      return { ...issue, x, z, path };
    });
    publishIssues(issues, source, !geoJson);
  }, [cityModel, geoJson]);
  useEffect(
    () => () => {
      for (const g of [
        ...built.glass,
        ...built.masonry.map((m) => m.geometry),
        ...built.siding,
        ...built.shingles,
        built.garden,
        built.metal,
        built.stone,
        built.water,
        built.streams,
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
      <mesh geometry={built.water} material={surfaces.water} renderOrder={2} receiveShadow raycast={() => null} />
      <mesh geometry={built.streams} material={surfaces.stream} renderOrder={2} receiveShadow raycast={() => null} />
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
      {built.masonry.map(({ color, geometry }, i) => (
        <mesh
          key={`masonry-${color}`}
          geometry={geometry}
          material={masonryLooks[i]}
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
      <Instanced geometry={shapes.head} material={looks.skin} items={built.peopleSkin} shadows={false} colored />
      <Instanced geometry={shapes.legs} material={looks.pants} items={built.peoplePants} colored />
      <Traffic lanes={built.traffic} shapes={shapes} looks={looks} reducedMotion={reducedMotion} />
      <Instanced geometry={shapes.trunk} material={looks.bark} items={built.trees} />
      <Instanced geometry={shapes.canopy} material={looks.leaves} items={built.trees} colored />
      <Instanced geometry={shapes.pole} material={looks.steel} items={built.lamps} />
      <Instanced geometry={shapes.bulb} material={looks.glow} items={built.lamps} shadows={false} />
      <Instanced geometry={shapes.hydrant} material={looks.red} items={built.hydrants} />
      <Instanced geometry={shapes.seat} material={looks.wood} items={built.benches} />
      <Instanced geometry={shapes.back} material={looks.wood} items={built.benches} />
      <ProposedStreetImprovements furniture={furniture} spots={built.proposed} />

      <IssueLayer reducedMotion={reducedMotion} />
      <AddressPin />
      <StreetSigns signs={built.signs} />
      <Sparkles count={90} scale={CITY_SPAN} size={2.4} speed={0.16} color="#ffffff" opacity={0.45} />
    </group>
  );
}
