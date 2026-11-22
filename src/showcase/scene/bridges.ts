/**
 * Bridges from OpenStreetMap: decks lifted off the ground, ramps down to
 * the streets they join, and towers and cables on the big suspension and
 * cable-stayed spans. Pure geometry in scene units, with no three.js, so it
 * can be tested on its own.
 *
 * OSM records which ways are bridges (bridge=*), how they stack (layer)
 * and sometimes how they are built (bridge:structure), but almost never how
 * high a deck or a tower stands. Those heights are constants here, not
 * survey data. A few landmarks whose tags are missing or wrong are listed
 * by OSM id in LANDMARK_OVERRIDES.
 */

import { insidePolygon } from "./coastline.ts";

export type Pt = readonly [number, number];
export type Pt3 = readonly [number, number, number];

/** Scene units per real metre across the ground (the city's CITY_SCALE). */
export const ACROSS = 0.14;
/** Scene units per real metre upward (the city's 1.5× height boost). */
export const UP = 0.21;

/** One deck level over a road, in metres: clearance plus structure. */
const LEVEL_M = 6;
/** A ship-channel deck: the Golden Gate is about 67 m over the water. */
const HIGH_DECK_M = 67;
/** Cable-stayed decks stand high even over a river. */
const CABLE_STAYED_M = 20;
/** Over water a deck rises with its length: 2.5 m per 100 m, at least 1.5 m. */
const WATER_RISE = 0.025;
const WET_MIN_M = 1.5;
/** Short bridges that cross no road are culverts and creek crossings. */
const SHORT_BRIDGE_M = 30;
/** Lowest deck over a road, in scene units. */
const MIN_DECK = 1.5;
/** Ramp grade: about 6 % up from the street to the deck. */
const RAMP_GRADE = 0.06;
/** Endpoints closer than this (scene units) are the same OSM node. */
const JOIN_TOL = 0.05;
/** Points along a deck are at most this far apart, so ramps stay smooth. */
const DENSIFY_STEP = 2.5;
/** Piers stand under decks higher than this. */
const PIER_MIN_Y = 0.6;

export type BridgeRoad = {
  id: string;
  points: readonly Pt[];
  /** road, footway, path, or sidewalk: approaches join only their own kind. */
  kind?: string;
  name?: string | null;
  ref?: string | null;
  /** True for the bridge itself (OSM bridge=* other than no). */
  bridge: boolean;
  /** OSM layer tag, 0 when absent. */
  layer?: number;
  structure?: string | null;
  colour?: string | null;
  halfWidth: number;
};

/** A man_made=bridge outline: the deck area, often with the structure and colour. */
export type BridgeOutline = {
  id: string;
  ring: readonly Pt[];
  structure?: string | null;
  colour?: string | null;
};

export type BridgeEnv = {
  /** True where the ground under (x, z) is mapped water. */
  wet?: (x: number, z: number) => boolean;
  /** True when this polyline crosses a street on the ground. */
  crossesRoad?: (points: readonly Pt[]) => boolean;
};

type TowerSpec = { at: number; meters: number; anchorage?: boolean };

export type LandmarkOverride = {
  /** Which landmark: pieces with the same name share one set of towers. */
  name: string;
  /** Deck height over the water or ground, in metres (before extra layers). */
  deckMeters?: number;
  /** Replaces a missing or wrong bridge:structure. */
  structure?: string;
  /** Towers as fractions of the span from its western end, with heights in metres. */
  towers?: TowerSpec[];
  colour?: string;
};

/** The Golden Gate: two towers 227 m over the water, in International Orange. */
const GOLDEN_GATE: LandmarkOverride = {
  name: "Golden Gate Bridge",
  structure: "suspension",
  colour: "#c0362c",
  towers: [
    { at: 0.17, meters: 227 },
    { at: 0.83, meters: 227 },
  ],
};

/**
 * Bay Bridge West Span: two suspension bridges end to end, joined at a
 * concrete centre anchorage. Towers about 160 m. Double deck.
 */
const BAY_WEST: LandmarkOverride = {
  name: "Bay Bridge West Span",
  structure: "suspension",
  deckMeters: 52,
  colour: "#a9b2b8",
  towers: [
    { at: 0.11, meters: 160 },
    { at: 0.33, meters: 160 },
    { at: 0.5, meters: 70, anchorage: true },
    { at: 0.67, meters: 160 },
    { at: 0.89, meters: 160 },
  ],
};

/** Bay Bridge East Span: one self-anchored tower near Yerba Buena Island, then the skyway. */
const BAY_EAST: LandmarkOverride = {
  name: "Bay Bridge East Span",
  structure: "suspension",
  deckMeters: 50,
  colour: "#e4e8ea",
  towers: [{ at: 0.14, meters: 160 }],
};

/** Landmarks by OSM id (outline or road way): tags that are missing or wrong. */
export const LANDMARK_OVERRIDES: Readonly<Record<string, LandmarkOverride>> = {
  // Golden Gate Bridge: outline relation and its carriageways.
  "21407754": GOLDEN_GATE,
  "537838948": GOLDEN_GATE,
  "595194543": GOLDEN_GATE,
  // San Francisco–Oakland Bay Bridge, West Span: outline, upper and lower deck.
  "1011568818": BAY_WEST,
  "8921938": BAY_WEST,
  "661905446": BAY_WEST,
  // Bay Bridge East Span: outlines and both directions.
  "1000066963": BAY_EAST,
  "1006027483": BAY_EAST,
  "236348361": BAY_EAST,
  "237731428": BAY_EAST,
  // Tobin Bridge, Boston: mapped as suspension, really a cantilever truss.
  "631109724": { name: "Tobin Bridge", structure: "cantilever", deckMeters: 41 },
};

export type Deck = {
  /** The way's points in its own direction, filled in so ramps stay smooth. */
  points: Pt[];
  /** Height of the road surface above the ground at each point, scene units. */
  ys: number[];
  /** True on the bridge; false on a street that ramps up to one. */
  bridge: boolean;
  /** Depth of the deck structure under the road, scene units. */
  depth: number;
  /** Mapped or landmark colour for the trim, when known. */
  colour: string | null;
  /** Long or towered: should read from across a bay. */
  landmark: boolean;
};

export type Tower = {
  x: number;
  z: number;
  /** Heading of the deck through the tower (radians, like `along`). */
  rot: number;
  /** Half the distance between the two legs. */
  halfSpan: number;
  /** Top of the tower above the ground or water. */
  top: number;
  /** Deck height at the tower. */
  deck: number;
  /** Leg thickness. */
  leg: number;
  /** A concrete anchorage block, not a two-legged tower. */
  anchorage: boolean;
  colour: string | null;
};

export type Cable = { points: Pt3[]; radius: number; colour: string | null };

export type Pier = {
  x: number;
  z: number;
  rot: number;
  /** Underside of the deck. */
  top: number;
  halfWidth: number;
  colour: string | null;
  landmark: boolean;
};

export type BridgePlan = {
  /** Lifted ways by id: bridges and the approaches that ramp up to them. */
  decks: Map<string, Deck>;
  towers: Tower[];
  cables: Cable[];
  piers: Pier[];
  /** Box around every bridge deck, so the sea can reach under them. */
  extent: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
};

/* —— Small geometry helpers —— */

function same(a: Pt, b: Pt) {
  return Math.abs(a[0] - b[0]) <= JOIN_TOL && Math.abs(a[1] - b[1]) <= JOIN_TOL;
}

function nodeKey(p: Pt) {
  return `${Math.round(p[0] / JOIN_TOL)},${Math.round(p[1] / JOIN_TOL)}`;
}

function cumulative(points: readonly Pt[]) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return cum;
}

export function polylineLength(points: readonly Pt[]) {
  return cumulative(points)[points.length - 1] ?? 0;
}

/** Position and unit direction at distance s along a polyline. */
function sample(points: readonly Pt[], cum: readonly number[], s: number) {
  const total = cum[cum.length - 1] ?? 0;
  const t = Math.max(0, Math.min(total, s));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1]! < t) i += 1;
  const a = points[i]!;
  const b = points[Math.min(points.length - 1, i + 1)]!;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const f = Math.max(0, Math.min(1, (t - cum[i]!) / len));
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len };
}

/** Linear interpolation of per-point values at distance s. */
function valueAt(cum: readonly number[], values: readonly number[], s: number) {
  if (values.length === 0) return 0;
  if (s <= 0) return values[0]!;
  for (let i = 1; i < cum.length; i += 1) {
    if (cum[i]! >= s) {
      const span = cum[i]! - cum[i - 1]! || 1;
      const f = (s - cum[i - 1]!) / span;
      return values[i - 1]! + (values[i]! - values[i - 1]!) * f;
    }
  }
  return values[values.length - 1]!;
}

/** Extra points so no step is longer than `step`. */
function densify(points: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const b = points[i]!;
    if (i > 0) {
      const a = points[i - 1]!;
      const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
      for (let k = 1; k <= n; k += 1) {
        const f = k / (n + 1);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    out.push(b);
  }
  return out;
}

function smoothstep(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function sameRoad(a: BridgeRoad, b: BridgeRoad) {
  if (a.name && a.name === b.name) return true;
  if (a.ref && a.ref === b.ref) return true;
  return !a.name && !b.name && !a.ref && !b.ref;
}

/* —— Runs: bridge ways joined end to end —— */

export type RunPiece = { way: BridgeRoad; reversed: boolean };
export type Run = { pieces: RunPiece[]; points: Pt[] };

function piecePoints(piece: RunPiece) {
  return piece.reversed ? [...piece.way.points].reverse() : [...piece.way.points];
}

/**
 * Join bridge ways that share an endpoint into runs. Where only two ways
 * meet they always join; where more meet, only the same street (name or
 * ref) carries on.
 */
export function joinRuns(ways: readonly BridgeRoad[]): Run[] {
  const usable = ways.filter((way) => way.points.length >= 2);
  const degree = new Map<string, number>();
  for (const way of usable) {
    for (const end of [way.points[0]!, way.points[way.points.length - 1]!]) {
      const key = nodeKey(end);
      degree.set(key, (degree.get(key) ?? 0) + 1);
    }
  }
  const pool = new Set(usable);
  const runs: Run[] = [];
  for (const first of usable) {
    if (!pool.has(first)) continue;
    pool.delete(first);
    const pieces: RunPiece[] = [{ way: first, reversed: false }];
    const extend = (atTail: boolean) => {
      for (;;) {
        const edge = atTail ? pieces[pieces.length - 1]! : pieces[0]!;
        const pts = piecePoints(edge);
        const end = atTail ? pts[pts.length - 1]! : pts[0]!;
        const candidates = [...pool].filter(
          (way) => same(way.points[0]!, end) || same(way.points[way.points.length - 1]!, end),
        );
        const pick =
          (degree.get(nodeKey(end)) ?? 0) === 2 ? candidates[0] : candidates.find((way) => sameRoad(way, edge.way));
        if (!pick) return;
        pool.delete(pick);
        const startsHere = same(pick.points[0]!, end);
        // At the tail a piece should start at the joint; at the head it should end there.
        const reversed = atTail ? !startsHere : startsHere;
        if (atTail) pieces.push({ way: pick, reversed });
        else pieces.unshift({ way: pick, reversed });
      }
    };
    extend(true);
    extend(false);
    const points: Pt[] = [];
    for (const piece of pieces) {
      const pts = piecePoints(piece);
      points.push(...(points.length > 0 ? pts.slice(1) : pts));
    }
    runs.push({ pieces, points });
  }
  return runs;
}

/* —— Heights —— */

function structureKind(structure: string | null | undefined) {
  const s = String(structure ?? "").toLowerCase();
  if (s.includes("suspension")) return "suspension";
  if (s.includes("cable")) return "cable-stayed";
  return s || null;
}

export type DeckInput = {
  /** Run length in scene units. */
  length: number;
  layer?: number;
  structure?: string | null;
  wet?: boolean;
  crossesRoad?: boolean;
  deckMeters?: number;
};

/**
 * Deck height above the ground or water, in scene units. A deck over a road
 * stands one level (6 m) per OSM layer; over water it rises with its length,
 * up to a ship channel's 67 m; suspension decks always stand that high.
 */
export function deckHeight(input: DeckInput): number {
  const layer = Math.max(0, Math.round(input.layer ?? 0));
  const lift = Math.max(0, layer - 1) * LEVEL_M;
  const lengthM = input.length / ACROSS;
  const kind = structureKind(input.structure);
  const lowWater = input.wet || (!input.crossesRoad && lengthM < SHORT_BRIDGE_M);
  let metres: number;
  if (input.deckMeters != null) {
    metres = input.deckMeters + lift;
  } else {
    const overRoad = LEVEL_M * Math.max(1, layer);
    const overWater = Math.min(HIGH_DECK_M, Math.max(WET_MIN_M, lengthM * WATER_RISE)) + lift;
    metres = lowWater ? (input.crossesRoad ? Math.max(overWater, overRoad) : overWater) : overRoad;
    if (kind === "suspension") metres = Math.max(metres, HIGH_DECK_M + lift);
    if (kind === "cable-stayed") metres = Math.max(metres, CABLE_STAYED_M + lift);
  }
  const y = metres * UP;
  return lowWater || input.deckMeters != null ? y : Math.max(MIN_DECK, y);
}

/** Horizontal length of a ramp up to `height` at the ramp grade, scene units. */
export function rampLength(height: number) {
  return ((height / UP) * ACROSS) / RAMP_GRADE;
}

/**
 * Deck height at each point of a run: full height in the middle, with a
 * smoothstep ramp at each end that meets the ground (`start`, `end`).
 */
export function rampProfile(
  points: readonly Pt[],
  height: number,
  ends: { start: boolean; end: boolean } = { start: true, end: true },
): number[] {
  const cum = cumulative(points);
  const total = cum[cum.length - 1] ?? 0;
  return cum.map((s) => profileAt(s, total, height, ends.start, ends.end));
}

function profileAt(
  s: number,
  total: number,
  height: number,
  rampStart: boolean,
  rampEnd: boolean,
  cap = Infinity,
) {
  const share = rampStart && rampEnd ? 0.35 : 0.6;
  const ramp = Math.max(1e-3, Math.min(rampLength(height), total * share, cap));
  let y = height;
  if (rampStart) y *= smoothstep(s / ramp);
  if (rampEnd) y *= smoothstep((total - s) / ramp);
  return y;
}

/* —— Towers —— */

/**
 * Towers for a span, as fractions from its western end with heights in
 * metres. Suspension: two towers at about 17 % and 83 %. Cable-stayed: one
 * or two masts. Arch, beam, truss, and cantilever bridges have none.
 */
export function towerSpecs(
  structure: string | null | undefined,
  length: number,
  deckMetres: number,
  override?: LandmarkOverride,
): TowerSpec[] {
  if (override?.towers) return override.towers;
  const kind = structureKind(override?.structure ?? structure);
  const lengthM = length / ACROSS;
  if (lengthM < 40) return [];
  if (kind === "suspension") {
    // Main span about two thirds of the length; towers rise about a ninth of it.
    const meters = deckMetres + 0.11 * 0.66 * lengthM;
    return [
      { at: 0.17, meters },
      { at: 0.83, meters },
    ];
  }
  if (kind === "cable-stayed") {
    if (lengthM > 300) {
      const meters = deckMetres + 0.25 * 0.5 * lengthM;
      return [
        { at: 0.25, meters },
        { at: 0.75, meters },
      ];
    }
    return [{ at: 0.5, meters: deckMetres + 0.3 * lengthM }];
  }
  return [];
}

/* —— The whole plan —— */

type RunInfo = {
  run: Run;
  points: Pt[];
  cum: number[];
  length: number;
  height: number;
  rampStart: boolean;
  rampEnd: boolean;
  /** Longest ramp on the bridge itself: towers stand on the level deck. */
  rampCap: number;
  structure: string | null;
  colour: string | null;
  override: LandmarkOverride | undefined;
  groupKey: string;
  specs: TowerSpec[];
  landmark: boolean;
  depth: number;
  halfWidth: number;
};

function outlineFor(points: readonly Pt[], outlines: readonly (BridgeOutline & { box: number[] })[]) {
  const cum = cumulative(points);
  const total = cum[cum.length - 1] ?? 0;
  for (const f of [0.5, 0.25, 0.75]) {
    const p = sample(points, cum, total * f);
    for (const outline of outlines) {
      const [minX, minZ, maxX, maxZ] = outline.box as [number, number, number, number];
      if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) continue;
      if (insidePolygon(p.x, p.z, outline.ring)) return outline;
    }
  }
  return null;
}

function deckDepth(height: number) {
  return height > 6 ? 1 : height > 3 ? 0.6 : 0.3;
}

/**
 * Plan every bridge in a map: deck heights, ramps on the bridge or on the
 * street that leads up to it, piers, towers, and cables.
 */
export function planBridges(
  ways: readonly BridgeRoad[],
  outlines: readonly BridgeOutline[] = [],
  env: BridgeEnv = {},
): BridgePlan {
  const decks = new Map<string, Deck>();
  const towers: Tower[] = [];
  const cables: Cable[] = [];
  const piers: Pier[] = [];
  const bridgeWays = ways.filter((way) => way.bridge && way.points.length >= 2);
  if (bridgeWays.length === 0) return { decks, towers, cables, piers, extent: null };

  const boxed = outlines
    .filter((outline) => outline.ring.length >= 3)
    .map((outline) => {
      const xs = outline.ring.map((p) => p[0]);
      const zs = outline.ring.map((p) => p[1]);
      return { ...outline, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
    });

  // Street ends, for approach ramps, and every bridge vertex, so a ramp
  // that lands on another deck stays up.
  const streetEnds = new Map<string, { way: BridgeRoad; atStart: boolean }[]>();
  for (const way of ways) {
    if (way.bridge || way.points.length < 2) continue;
    for (const atStart of [true, false]) {
      const key = nodeKey(atStart ? way.points[0]! : way.points[way.points.length - 1]!);
      const list = streetEnds.get(key) ?? [];
      list.push({ way, atStart });
      streetEnds.set(key, list);
    }
  }
  const runs = joinRuns(bridgeWays);
  const deckNodes = new Map<string, Set<Run>>();
  for (const run of runs) {
    for (const p of run.points) {
      const key = nodeKey(p);
      const set = deckNodes.get(key) ?? new Set<Run>();
      set.add(run);
      deckNodes.set(key, set);
    }
  }

  type Ramp = { atStart: boolean; height: number; length: number };
  const approachRamps = new Map<BridgeRoad, Ramp[]>();
  const infos: RunInfo[] = [];

  for (const run of runs) {
    const ref = run.pieces[0]!.way;
    const cum = cumulative(run.points);
    const length = cum[cum.length - 1] ?? 0;
    if (length < 1e-3) continue;
    const outline = outlineFor(run.points, boxed);
    const override =
      (outline ? LANDMARK_OVERRIDES[outline.id] : undefined) ??
      run.pieces.map((piece) => LANDMARK_OVERRIDES[piece.way.id]).find(Boolean);
    const wayStructure = run.pieces.map((piece) => piece.way.structure).find(Boolean) ?? null;
    const structure = override?.structure ?? wayStructure ?? outline?.structure ?? null;
    // An approach piece named for a landmark wears its colour too.
    const namesake = Object.values(LANDMARK_OVERRIDES).find((one) => one.name === ref.name);
    const colour =
      override?.colour ??
      outline?.colour ??
      namesake?.colour ??
      run.pieces.map((piece) => piece.way.colour).find(Boolean) ??
      null;
    const layer = Math.max(...run.pieces.map((piece) => piece.way.layer ?? 0));
    let wetSamples = 0;
    if (env.wet) {
      for (let k = 0; k < 7; k += 1) {
        const p = sample(run.points, cum, length * (0.2 + (0.6 * k) / 6));
        if (env.wet(p.x, p.z)) wetSamples += 1;
      }
    }
    const height = deckHeight({
      length,
      layer,
      structure,
      wet: wetSamples >= 2,
      crossesRoad: env.crossesRoad?.(run.points) ?? false,
      deckMeters: override?.deckMeters,
    });
    // Each end: joins another deck (stays up), an approach street (ramps
    // there), or nothing (ramps on the bridge itself).
    const ends = [run.points[0]!, run.points[run.points.length - 1]!].map((end, index) => {
      const decksHere = deckNodes.get(nodeKey(end));
      if (decksHere && [...decksHere].some((other) => other !== run)) return "deck" as const;
      const ideal = rampLength(height);
      const edgeWay = (index === 0 ? run.pieces[0]! : run.pieces[run.pieces.length - 1]!).way;
      const options = (streetEnds.get(nodeKey(end)) ?? []).filter(
        (option) => (option.way.kind ?? "road") === (edgeWay.kind ?? "road"),
      );
      const best = options
        .map((option) => ({ ...option, length: polylineLength(option.way.points) }))
        .filter((option) => option.length >= ideal * 0.5)
        .sort((a, b) => Number(sameRoad(b.way, edgeWay)) - Number(sameRoad(a.way, edgeWay)) || b.length - a.length)[0];
      if (!best) return "ramp" as const;
      const list = approachRamps.get(best.way) ?? [];
      list.push({ atStart: best.atStart, height, length: Math.min(best.length, ideal) });
      approachRamps.set(best.way, list);
      return "street" as const;
    });
    const deckMetres = height / UP;
    const specs = towerSpecs(structure, length, deckMetres, override);
    const landmark = length / ACROSS > 1000 || specs.length > 0;
    const outermost = Math.min(1, ...specs.map((spec) => Math.min(spec.at, 1 - spec.at)));
    infos.push({
      run,
      points: run.points,
      cum,
      length,
      height,
      rampStart: ends[0] === "ramp",
      rampEnd: ends[1] === "ramp",
      rampCap: specs.length > 0 ? outermost * length * 0.9 : Infinity,
      structure,
      colour,
      override,
      groupKey: override?.name ?? outline?.id ?? ref.name ?? ref.ref ?? `run-${infos.length}`,
      specs,
      landmark,
      depth: deckDepth(height),
      halfWidth: Math.max(...run.pieces.map((piece) => piece.way.halfWidth)),
    });
  }

  // Decks: each bridge way gets the run's profile, in its own direction.
  let extent: BridgePlan["extent"] = null;
  for (const info of infos) {
    let offset = 0;
    for (const piece of info.run.pieces) {
      const pts = densify(piecePoints(piece), DENSIFY_STEP);
      const local = cumulative(pts);
      const ys = local.map((s) =>
        profileAt(offset + s, info.length, info.height, info.rampStart, info.rampEnd, info.rampCap),
      );
      offset += local[local.length - 1] ?? 0;
      if (piece.reversed) {
        pts.reverse();
        ys.reverse();
      }
      decks.set(piece.way.id, {
        points: pts,
        ys,
        bridge: true,
        depth: info.depth,
        colour: info.colour,
        landmark: info.landmark,
      });
      for (const [x, z] of pts) {
        extent = extent ?? { minX: x, maxX: x, minZ: z, maxZ: z };
        extent.minX = Math.min(extent.minX, x);
        extent.maxX = Math.max(extent.maxX, x);
        extent.minZ = Math.min(extent.minZ, z);
        extent.maxZ = Math.max(extent.maxZ, z);
      }
    }
  }

  // Approaches: the street climbs to the deck over its first stretch.
  for (const [way, ramps] of approachRamps) {
    if (decks.has(way.id)) continue;
    const pts = densify(way.points, DENSIFY_STEP);
    const cum = cumulative(pts);
    const total = cum[cum.length - 1] ?? 0;
    const ys = cum.map((s) =>
      Math.max(
        0,
        ...ramps.map((ramp) => {
          const d = ramp.atStart ? s : total - s;
          return ramp.height * (1 - smoothstep(d / Math.max(1e-3, ramp.length)));
        }),
      ),
    );
    const top = Math.max(...ramps.map((ramp) => ramp.height));
    decks.set(way.id, { points: pts, ys, bridge: false, depth: deckDepth(top), colour: null, landmark: false });
  }

  // Towers and cables: parallel carriageways and stacked decks share one set.
  // Longest first, so each group is led by its longest run.
  const groups: RunInfo[][] = [];
  for (const info of infos.filter((one) => one.specs.length > 0).sort((a, b) => b.length - a.length)) {
    const mid = sample(info.points, info.cum, info.length / 2);
    const home = groups.find((group) => {
      const lead = group[0]!;
      if (lead.groupKey !== info.groupKey) return false;
      const p = sample(lead.points, lead.cum, nearestS(lead, mid.x, mid.z));
      return Math.hypot(p.x - mid.x, p.z - mid.z) < 10 && Math.abs(p.dx * mid.dx + p.dz * mid.dz) > 0.8;
    });
    if (home) home.push(info);
    else groups.push([info]);
  }
  // A short piece of a landmark (an approach tagged with the same name and
  // structure) does not get towers of its own.
  const names = (group: RunInfo[]) => new Set(group.flatMap((info) => info.run.pieces.map((piece) => piece.way.name)));
  const towered = groups.filter(
    (group) =>
      group[0]!.override !== undefined ||
      !groups.some(
        (other) =>
          other !== group &&
          other[0]!.length > group[0]!.length &&
          [...names(group)].some((name) => name && names(other).has(name)),
      ),
  );
  const noPier: { points: Pt[]; reach: number }[] = [];
  for (const group of towered) {
    const lead = group[0]!;
    // Across the group: from the outer edge of one carriageway to the other.
    let lo = Infinity;
    let hi = -Infinity;
    for (const info of group) {
      const m = sample(info.points, info.cum, info.length / 2);
      const s = nearestS(lead, m.x, m.z);
      const p = sample(lead.points, lead.cum, s);
      const d = (m.x - p.x) * -p.dz + (m.z - p.z) * p.dx;
      lo = Math.min(lo, d - info.halfWidth);
      hi = Math.max(hi, d + info.halfWidth);
    }
    const center = (lo + hi) / 2;
    const halfSpan = (hi - lo) / 2 + 0.25;
    const deckAt = (s: number) => profileAt(s, lead.length, lead.height, lead.rampStart, lead.rampEnd, lead.rampCap);
    const westFirst = lead.points[0]![0] <= lead.points[lead.points.length - 1]![0];
    const colour = group.map((info) => info.colour).find(Boolean) ?? null;
    const at = (s: number, side: number) => {
      const p = sample(lead.points, lead.cum, s);
      const off = center + side;
      return { x: p.x - p.dz * off, z: p.z + p.dx * off, dx: p.dx, dz: p.dz };
    };
    const stations = lead.specs
      .map((spec) => {
        const s = lead.length * (westFirst ? spec.at : 1 - spec.at);
        const deck = deckAt(s);
        return { s, deck, top: Math.max(deck + 2, spec.meters * UP), anchorage: Boolean(spec.anchorage) };
      })
      .sort((a, b) => a.s - b.s);
    for (const station of stations) {
      const p = at(station.s, 0);
      towers.push({
        x: p.x,
        z: p.z,
        rot: Math.atan2(p.dx, p.dz),
        halfSpan,
        top: station.top,
        deck: station.deck,
        leg: Math.max(0.25, Math.min(1.5, station.top * 0.025)),
        anchorage: station.anchorage,
        colour,
      });
    }
    const real = stations.filter((station) => !station.anchorage);
    if (real.length >= 2) {
      const from = real[0]!.s;
      const to = real[real.length - 1]!.s;
      const pts: Pt[] = [];
      for (let s = from; s <= to; s += 2) {
        const p = at(s, 0);
        pts.push([p.x, p.z]);
      }
      noPier.push({ points: pts, reach: halfSpan + 1 });
    }
    const kind = structureKind(lead.override?.structure ?? lead.structure);
    for (const side of [-halfSpan, halfSpan]) {
      if (kind === "cable-stayed") {
        cables.push(...stays(stations, lead.length, side, at, deckAt, colour));
      } else {
        cables.push(...mainCable(stations, lead.length, side, at, deckAt, colour));
      }
    }
  }

  // Piers under the high parts of every deck, except a suspended main span.
  const byId = new Map(ways.map((way) => [way.id, way]));
  for (const [id, deck] of decks) {
    const way = byId.get(id);
    if (!way) continue;
    const top = Math.max(...deck.ys);
    if (top <= PIER_MIN_Y) continue;
    const spacing = top > 6 ? 18 : 8;
    const cum = cumulative(deck.points);
    const total = cum[cum.length - 1] ?? 0;
    for (let s = spacing / 2; s < total; s += spacing) {
      const y = valueAt(cum, deck.ys, s);
      if (y <= PIER_MIN_Y) continue;
      const p = sample(deck.points, cum, s);
      const hung = noPier.some((zone) =>
        zone.points.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < zone.reach),
      );
      if (hung) continue;
      piers.push({
        x: p.x,
        z: p.z,
        rot: Math.atan2(p.dx, p.dz),
        top: Math.max(0, y - deck.depth),
        halfWidth: way.halfWidth * 0.7,
        colour: deck.colour,
        landmark: deck.landmark,
      });
    }
  }

  return { decks, towers, cables, piers, extent };
}

function nearestS(info: RunInfo, x: number, z: number) {
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s <= info.length; s += Math.max(0.5, info.length / 200)) {
    const p = sample(info.points, info.cum, s);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

type Station = { s: number; deck: number; top: number; anchorage: boolean };
type At = (s: number, side: number) => { x: number; z: number };

/**
 * A suspension cable on one side: a parabola between towers, sagging to
 * just above the deck, and backstays down to the ends of the span, with
 * vertical hangers to the deck below.
 */
function mainCable(
  stations: Station[],
  length: number,
  side: number,
  at: At,
  deckAt: (s: number) => number,
  colour: string | null,
): Cable[] {
  const out: Cable[] = [];
  const real = stations.filter((station) => !station.anchorage);
  const points: { s: number; y: number; tower: boolean }[] = [];
  if (real.length === 1) {
    // Self-anchored, one tower: the cable comes down to the deck on both sides.
    const reach = length * 0.12;
    const t = real[0]!;
    points.push({ s: Math.max(0, t.s - reach), y: deckAt(Math.max(0, t.s - reach)) + 0.2, tower: false });
    points.push({ s: t.s, y: t.top, tower: true });
    points.push({ s: Math.min(length, t.s + reach), y: deckAt(Math.min(length, t.s + reach)) + 0.2, tower: false });
  } else {
    points.push({ s: 0, y: deckAt(0) + 0.2, tower: false });
    for (const station of stations) {
      points.push({ s: station.s, y: station.top, tower: !station.anchorage });
    }
    points.push({ s: length, y: deckAt(length) + 0.2, tower: false });
  }
  const line: Pt3[] = [];
  for (let k = 0; k < points.length - 1; k += 1) {
    const a = points[k]!;
    const b = points[k + 1]!;
    const span = b.s - a.s;
    if (span <= 1e-3) continue;
    const mainSpan = a.tower && b.tower;
    const low = deckAt((a.s + b.s) / 2) + 0.5;
    const sag = mainSpan ? Math.max(0, (a.y + b.y) / 2 - low) : 0.12 * Math.abs(a.y - b.y);
    const steps = Math.max(6, Math.ceil(span / 3));
    for (let i = k === 0 ? 0 : 1; i <= steps; i += 1) {
      const t = i / steps;
      const s = a.s + span * t;
      const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
      const p = at(s, side);
      line.push([p.x, y, p.z]);
      const deck = deckAt(s);
      if (i > 0 && i < steps && y - deck > 0.4) {
        out.push({ points: [[p.x, y, p.z], [p.x, deck, p.z]], radius: 0.05, colour });
      }
    }
  }
  out.push({ points: line, radius: 0.3, colour });
  return out;
}

/** Cable-stayed: straight stays fanning from each mast down to the deck. */
function stays(
  stations: Station[],
  length: number,
  side: number,
  at: At,
  deckAt: (s: number) => number,
  colour: string | null,
): Cable[] {
  const out: Cable[] = [];
  const masts = stations.filter((station) => !station.anchorage);
  const gap = masts.length > 1 ? Math.abs(masts[1]!.s - masts[0]!.s) : length;
  const reach = gap * 0.45;
  for (const mast of masts) {
    const p = at(mast.s, side);
    for (const dir of [-1, 1]) {
      for (let k = 1; k <= 8; k += 1) {
        const s = mast.s + dir * reach * (k / 8);
        if (s < 0 || s > length) continue;
        const q = at(s, side);
        const anchor = mast.top - (mast.top - mast.deck) * 0.3 * (k / 8);
        out.push({ points: [[p.x, anchor, p.z], [q.x, deckAt(s) + 0.1, q.z]], radius: 0.08, colour });
      }
    }
  }
  return out;
}
