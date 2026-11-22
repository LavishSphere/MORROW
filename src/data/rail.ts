/**
 * Rail and transit from OpenStreetMap, for any city: which ways are track,
 * which are in a tunnel or on a bridge, what colour each line is, and the
 * small polyline helpers the scene uses to draw and move trains.
 * Pure functions only, so they run in tests without a canvas.
 */

export type Pt = readonly [number, number];

/** railway=* values drawn as track. */
export const RAIL_TYPES = [
  "rail",
  "subway",
  "light_rail",
  "tram",
  "monorail",
  "narrow_gauge",
  "funicular",
] as const;

/** railway=* values on nodes that are stops or entrances. */
export const STATION_NODE_TYPES = ["station", "halt", "tram_stop", "subway_entrance"] as const;

/** Tags kept on rail ways, platforms, and stations. OSM `layer` is stored as `layer:osm`. */
export const RAIL_TAGS = [
  "railway",
  "service",
  "tunnel",
  "bridge",
  "covered",
  "level",
  "wheelchair",
  "station",
  "colour",
  "ref",
  "network",
] as const;

/** Where OSM's vertical `layer` tag is kept, so it never clashes with our feature layer. */
export const OSM_LAYER = "layer:osm";

/** Track drawn thinner and in a neutral tone: not a passenger line. */
const MINOR_SERVICE = new Set(["crossover", "yard", "siding", "spur"]);

/** Neutral steel for track with no line colour (freight, Amtrak, yards). */
export const NEUTRAL_TRACK = "#7a8086";

/** Pick the rail tags from a raw OSM tag record. */
export function railTags(raw: Record<string, unknown> | undefined | null): Record<string, string> {
  const tags: Record<string, string> = {};
  if (!raw) return tags;
  for (const key of RAIL_TAGS) {
    const value = raw[key];
    if (typeof value === "string") tags[key] = value;
  }
  // Never overwrite our own feature `layer`: OSM's vertical layer is `layer:osm`.
  if (typeof raw.layer === "string") tags[OSM_LAYER] = raw.layer;
  return tags;
}

/** 'rail' for track, 'platform' for a platform way, null for anything else. */
export function railWayKind(raw: Record<string, unknown> | undefined | null): "rail" | "platform" | null {
  const railway = raw?.railway;
  if (railway === "platform" || (raw?.public_transport === "platform" && raw?.train === "yes")) return "platform";
  if (typeof railway === "string" && (RAIL_TYPES as readonly string[]).includes(railway)) return "rail";
  return null;
}

function num(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = parseFloat(String(value).split(";")[0] ?? "");
  return Number.isFinite(n) ? n : null;
}

function yes(value: unknown) {
  return typeof value === "string" && value !== "" && value !== "no";
}

export function isBridge(tags: Record<string, unknown>): boolean {
  return yes(tags.bridge);
}

/** Tunnels, negative layers, and negative levels are below ground. */
export function isUnderground(tags: Record<string, unknown>): boolean {
  if (yes(tags.tunnel)) return true;
  if (isBridge(tags)) return false;
  const layer = num(tags[OSM_LAYER]);
  if (layer !== null && layer < 0) return true;
  const level = num(tags.level);
  return level !== null && level < 0;
}

/** Yards, sidings, spurs, and crossovers. */
export function isMinorTrack(tags: Record<string, unknown>): boolean {
  return typeof tags.service === "string" && MINOR_SERVICE.has(tags.service);
}

/* —— Line colours —— */

const NAMED: Record<string, string> = {
  red: "#d52b1e",
  orange: "#f08a00",
  yellow: "#ffd200",
  gold: "#d4a017",
  green: "#2e9e44",
  blue: "#1f5fbf",
  purple: "#7b3f98",
  violet: "#7b3f98",
  brown: "#8b5a2b",
  pink: "#e27ea6",
  silver: "#a4a9ad",
  grey: "#8a8f94",
  gray: "#8a8f94",
  teal: "#008c95",
  beige: "#d5cfa3",
  black: "#333333",
  white: "#e8e8e8",
};

/** "#DA291C;#DA291C", "da291c", "#abc", "red" → "#da291c"; anything else → null. */
export function normalizeColour(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  for (const part of raw.split(";")) {
    const v = part.trim().toLowerCase();
    if (/^#?[0-9a-f]{6}$/.test(v)) return `#${v.replace("#", "")}`;
    const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
    if (NAMED[v]) return NAMED[v]!;
  }
  return null;
}

const nyc = (refs: string, colour: string) =>
  Object.fromEntries(refs.split(" ").map((ref) => [ref, colour]));

/**
 * Official line colours by system and ref, used only when the route
 * relation itself carries no colour.
 */
const SYSTEM_COLOURS: Record<string, Record<string, string>> = {
  mbta: {
    red: "#da291c",
    "red line": "#da291c",
    mattapan: "#da291c",
    orange: "#ed8b00",
    "orange line": "#ed8b00",
    blue: "#003da5",
    "blue line": "#003da5",
    green: "#00843d",
    "green line": "#00843d",
    b: "#00843d",
    c: "#00843d",
    d: "#00843d",
    e: "#00843d",
    silver: "#7c878e",
    cr: "#80276c",
    "commuter rail": "#80276c",
  },
  bart: {
    yellow: "#ffe600",
    orange: "#ff9933",
    red: "#ed1c24",
    green: "#339933",
    blue: "#0099cc",
    beige: "#d5cfa3",
    grey: "#d5cfa3",
  },
  nyc: {
    ...nyc("a c e", "#0039a6"),
    ...nyc("b d f fx m", "#ff6319"),
    g: "#6cbe45",
    ...nyc("j z", "#996633"),
    l: "#a7a9ac",
    ...nyc("n q r w", "#fccc0a"),
    ...nyc("1 2 3", "#ee352e"),
    ...nyc("4 5 6 6x", "#00933c"),
    ...nyc("7 7x", "#b933ad"),
    ...nyc("s gs fs h", "#808183"),
    sir: "#0039a6",
  },
  cta: {
    red: "#c60c30",
    blue: "#00a1de",
    brown: "#62361b",
    brn: "#62361b",
    green: "#009b3a",
    g: "#009b3a",
    orange: "#f9461c",
    org: "#f9461c",
    pink: "#e27ea6",
    purple: "#522398",
    p: "#522398",
    yellow: "#f9e300",
    y: "#f9e300",
  },
  wmata: {
    red: "#bf0d3e",
    rd: "#bf0d3e",
    orange: "#ed8b00",
    or: "#ed8b00",
    blue: "#009cde",
    bl: "#009cde",
    green: "#00b140",
    gr: "#00b140",
    yellow: "#ffd100",
    yl: "#ffd100",
    silver: "#919d9d",
    sv: "#919d9d",
  },
  septa: {
    mfl: "#00a1de",
    l: "#00a1de",
    "market-frankford": "#00a1de",
    bsl: "#f58220",
    b: "#f58220",
    "broad street": "#f58220",
    nhsl: "#7e3b8a",
    m: "#7e3b8a",
    ...nyc("10 11 13 15 34 36 t t1 t2 t3 t4 t5", "#5a960a"),
    ...nyc("101 102 d d1 d2", "#dc2e6b"),
    "regional rail": "#45637a",
  },
  lametro: {
    a: "#0072bc",
    b: "#e3131b",
    c: "#58a738",
    d: "#a05da5",
    e: "#fdb913",
    k: "#e96bb0",
    blue: "#0072bc",
    red: "#e3131b",
    green: "#58a738",
    purple: "#a05da5",
    gold: "#fdb913",
    expo: "#fdb913",
  },
  dart: {
    red: "#ce0e2d",
    blue: "#0055b8",
    green: "#009b3a",
    orange: "#f7931e",
    silver: "#a4a9ad",
  },
  muni: {
    j: "#a96614",
    k: "#437c93",
    l: "#8d5494",
    m: "#008547",
    n: "#005b95",
    t: "#bf2b45",
    s: "#ffcc00",
    f: "#b49a36",
  },
  amtrak: {},
};

/** Which known system a network/operator name belongs to. */
export function systemOf(network: string | null | undefined): string | null {
  const n = (network ?? "").toLowerCase();
  if (!n) return null;
  if (/amtrak/.test(n)) return "amtrak";
  if (/\bmbta\b|massachusetts bay/.test(n)) return "mbta";
  if (/\bbart\b|bay area rapid/.test(n)) return "bart";
  if (/\bnyc|new york city|\bmta\b.*new york|staten island/.test(n)) return "nyc";
  if (/\bcta\b|chicago transit|chicago 'l'|chicago l\b/.test(n)) return "cta";
  if (/wmata|washington metro|metrorail/.test(n)) return "wmata";
  if (/septa/.test(n)) return "septa";
  if (/la metro|los angeles|lacmta|metro rail.*la/.test(n)) return "lametro";
  if (/\bdart\b|dallas area/.test(n)) return "dart";
  if (/\bmuni\b|sfmta|san francisco municipal/.test(n)) return "muni";
  return null;
}

/**
 * A line colour from a ref or name when no colour was tagged. With a known
 * network the system table wins; MBTA ref patterns (Green-B, CR-*) and a
 * colour word in the name ("Yellow Line") work anywhere. Amtrak is neutral.
 */
export function colourForRef(ref: string | null | undefined, network?: string | null): string | null {
  const raw = (ref ?? "").trim().toLowerCase();
  const system = systemOf(network) ?? systemOf(raw);
  if (system === "amtrak") return NEUTRAL_TRACK;
  if (!raw) return null;
  if (raw.startsWith("cr-") || raw.includes("commuter rail")) return SYSTEM_COLOURS.mbta!.cr!;
  if (/^green-[bcde]$/.test(raw)) return SYSTEM_COLOURS.mbta!.green!;
  if (system) {
    const table = SYSTEM_COLOURS[system]!;
    const hit = table[raw] ?? table[raw.replace(/\s*line$/, "")];
    if (hit) return hit;
  }
  for (const word of raw.split(/[\s\-/]+/)) {
    if (NAMED[word] && word !== "white" && word !== "black") return NAMED[word]!;
  }
  return null;
}

/** One route relation a track way belongs to. */
export type RouteRelation = { colour: string | null; ref: string | null; network: string | null };

/**
 * The route relations a way belongs to (Overpass "railref" rows), plus the
 * distinct colours, refs, and networks among them.
 */
export type RailRef = { relations: RouteRelation[]; colours: string[]; refs: string[]; networks: string[] };

function splitList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Collect "railref" rows into a lookup by way id. Each row is one route
 * relation; a row whose values are ';'-joined sets still works.
 */
export function railRefsFrom(elements: readonly unknown[]): Map<number, RailRef> {
  const refs = new Map<number, RailRef>();
  for (const element of elements) {
    if (!element || typeof element !== "object") continue;
    const row = element as { type?: unknown; tags?: Record<string, unknown> };
    if (row.type !== "railref") continue;
    const wayId = Number(row.tags?.way);
    if (!Number.isFinite(wayId)) continue;
    const colours = splitList(row.tags?.colour);
    const names = splitList(row.tags?.ref);
    const networks = splitList(row.tags?.network);
    if (colours.length + names.length + networks.length === 0) continue;
    const prev = refs.get(wayId) ?? { relations: [], colours: [], refs: [], networks: [] };
    const add = (list: string[], values: string[]) => {
      for (const v of values) if (!list.includes(v)) list.push(v);
    };
    add(prev.colours, colours);
    add(prev.refs, names);
    add(prev.networks, networks);
    if (colours.length <= 1 && names.length <= 1 && networks.length <= 1) {
      prev.relations.push({ colour: colours[0] ?? null, ref: names[0] ?? null, network: networks[0] ?? null });
    } else {
      // A joined set: values no longer line up, so each colour counts once.
      for (const colour of colours) prev.relations.push({ colour, ref: null, network: null });
      if (colours.length === 0) {
        for (const ref of names) prev.relations.push({ colour: null, ref, network: networks[0] ?? null });
      }
    }
    refs.set(wayId, prev);
  }
  return refs;
}

/**
 * One colour for a rail way: its own colour tag, then the colour most of
 * its route relations share (intercity Amtrak routes do not count, so a
 * shared corridor takes the local line's colour), then the ref/name
 * fallback table. Null means neutral track.
 */
export function lineColour(tags: Record<string, unknown>, ref?: RailRef | null, name?: string | null): string | null {
  const own = normalizeColour(tags.colour);
  if (own) return own;
  const counts = new Map<string, number>();
  let intercity = false;
  for (const relation of ref?.relations ?? []) {
    if (systemOf(relation.network) === "amtrak" || systemOf(relation.ref) === "amtrak") {
      intercity = true;
      continue;
    }
    const colour = normalizeColour(relation.colour) ?? colourForRef(relation.ref, relation.network);
    if (colour && colour !== NEUTRAL_TRACK) counts.set(colour, (counts.get(colour) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [colour, count] of counts) if (!best || count > counts.get(best)!) best = colour;
  if (best) return best;
  if (intercity) return null;
  const network = typeof tags.network === "string" ? tags.network : null;
  for (const candidate of [typeof tags.ref === "string" ? tags.ref : null, name ?? null]) {
    const colour = colourForRef(candidate, network);
    if (colour) return colour === NEUTRAL_TRACK ? null : colour;
  }
  return null;
}

/* —— Scene network —— */

export type RailLine = {
  id: string;
  name?: string;
  points: Pt[];
  /** Line colour, or null for neutral track. */
  colour: string | null;
  ref?: string;
  /** railway=* (subway, light_rail, rail, tram…). */
  railway: string;
  underground: boolean;
  bridge: boolean;
  /** Yard, siding, spur, crossover. */
  minor: boolean;
};

export type RailPlatform = {
  id: string;
  name?: string;
  /** Closed ring when `area`, else a centerline. */
  points: Pt[];
  area: boolean;
  underground: boolean;
};

export type Station = {
  id: string;
  name?: string;
  x: number;
  z: number;
  lon: number;
  lat: number;
  /** station, halt, tram_stop, or subway_entrance. */
  railway: string;
  /** station=subway|light_rail|train… */
  station: string | null;
  wheelchair: string | null;
  /** Colours of the lines that serve it, for the label chips. */
  colours: string[];
  entrance: boolean;
};

export type RailNetwork = { lines: RailLine[]; platforms: RailPlatform[]; stations: Station[] };

export const EMPTY_RAIL: RailNetwork = { lines: [], platforms: [], stations: [] };

type Feature = {
  id?: string | number;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown> | null;
};

function lonLat(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || typeof value[0] !== "number" || typeof value[1] !== "number") return null;
  return [value[0], value[1]];
}

function projectAll(coords: unknown, project: (lon: number, lat: number) => Pt): Pt[] {
  const out: Pt[] = [];
  if (!Array.isArray(coords)) return out;
  for (const pair of coords) {
    const ll = lonLat(pair);
    if (!ll) continue;
    const p = project(ll[0], ll[1]);
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < 1e-6 && Math.abs(prev[1] - p[1]) < 1e-6) continue;
    out.push(p);
  }
  return out;
}

/** How near a line must pass for a station to wear its colour (≈85 m). */
const STATION_REACH = 12;

/** Read the rail, rail_platform, and station features of a basemap. */
export function parseRail(features: readonly unknown[], project: (lon: number, lat: number) => Pt): RailNetwork {
  const lines: RailLine[] = [];
  const platforms: RailPlatform[] = [];
  const stations: Station[] = [];
  for (const raw of features) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Feature;
    const props = f.properties ?? {};
    const layer = props.layer;
    if (layer !== "rail" && layer !== "rail_platform" && layer !== "station") continue;
    const id = String(f.id ?? props.osmId ?? `${layer}-${lines.length + platforms.length + stations.length}`);
    const name = typeof props.name === "string" ? props.name : undefined;
    const type = f.geometry?.type;
    if (layer === "rail" && type === "LineString") {
      const points = projectAll(f.geometry?.coordinates, project);
      if (points.length < 2) continue;
      lines.push({
        id,
        name,
        points,
        colour: normalizeColour(props.colour),
        ref: typeof props.ref === "string" ? props.ref : undefined,
        railway: typeof props.railway === "string" ? props.railway : "rail",
        underground: isUnderground(props),
        bridge: isBridge(props),
        minor: isMinorTrack(props),
      });
    } else if (layer === "rail_platform" && (type === "LineString" || type === "Polygon")) {
      const coords = type === "Polygon" ? (f.geometry?.coordinates as unknown[])?.[0] : f.geometry?.coordinates;
      const points = projectAll(coords, project);
      const area = type === "Polygon";
      if (area) {
        const first = points[0];
        const last = points[points.length - 1];
        if (first && last && first[0] === last[0] && first[1] === last[1]) points.pop();
      }
      if (points.length < (area ? 3 : 2)) continue;
      platforms.push({ id, name, points, area, underground: isUnderground(props) });
    } else if (layer === "station" && type === "Point") {
      const ll = lonLat(f.geometry?.coordinates);
      if (!ll) continue;
      const [x, z] = project(ll[0], ll[1]);
      const railway = typeof props.railway === "string" ? props.railway : "station";
      const own = typeof props.colour === "string" ? props.colour.split(";").map(normalizeColour) : [];
      stations.push({
        id,
        name,
        x,
        z,
        lon: ll[0],
        lat: ll[1],
        railway,
        station: typeof props.station === "string" ? props.station : null,
        wheelchair: typeof props.wheelchair === "string" ? props.wheelchair : null,
        colours: own.filter((c): c is string => Boolean(c)),
        entrance: railway === "subway_entrance",
      });
    }
  }
  // A line's colour written two ways ("green" and #00843D) becomes one:
  // the colour more ways use.
  const tally = new Map<string, number>();
  for (const line of lines) if (line.colour) tally.set(line.colour, (tally.get(line.colour) ?? 0) + 1);
  const ranked = [...tally.keys()].sort((a, b) => tally.get(b)! - tally.get(a)!);
  const canonical = (colour: string) => ranked.find((c) => similarColour(c, colour)) ?? colour;
  for (const line of lines) if (line.colour) line.colour = canonical(line.colour);
  // Stations wear the colours of the lines passing close by, then their own tag's.
  for (const station of stations) {
    if (station.entrance) continue;
    const own = station.colours.map(canonical);
    const chips: string[] = [];
    for (const line of lines) {
      if (!line.colour || line.minor || chips.includes(line.colour)) continue;
      if (nearestOnPolyline(station.x, station.z, line.points).distance < STATION_REACH) chips.push(line.colour);
    }
    for (const colour of own) if (!chips.some((c) => similarColour(c, colour))) chips.push(colour);
    station.colours = chips.slice(0, 5);
  }
  return { lines, platforms, stations };
}

/* —— Polyline helpers —— */

export function polylineLength(points: readonly Pt[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  }
  return total;
}

export type Snap = {
  distance: number;
  /** Distance from the polyline's start to the snapped point. */
  along: number;
  x: number;
  z: number;
  /** Unit direction of travel at the snapped point. */
  dx: number;
  dz: number;
};

/** Nearest point on a polyline to (x, z). */
export function nearestOnPolyline(x: number, z: number, points: readonly Pt[]): Snap {
  let best: Snap = { distance: Infinity, along: 0, x, z, dx: 1, dz: 0 };
  let walked = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len)));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.distance) best = { distance: d, along: walked + len * t, x: px, z: pz, dx: dx / len, dz: dz / len };
    walked += len;
  }
  return best;
}

/** The point `along` units from the start (clamped), with its direction. */
export function pointAlong(points: readonly Pt[], along: number): { x: number; z: number; dx: number; dz: number } {
  let remaining = Math.max(0, along);
  let last = { x: points[0]?.[0] ?? 0, z: points[0]?.[1] ?? 0, dx: 1, dz: 0 };
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-9) continue;
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    if (remaining <= len) return { x: ax + dx * remaining, z: az + dz * remaining, dx, dz };
    remaining -= len;
    last = { x: bx, z: bz, dx, dz };
  }
  return last;
}

/**
 * True when two colours are the same line colour, allowing for small
 * differences between a feed's colour and the one mapped in OSM.
 */
export function similarColour(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeColour(a);
  const y = normalizeColour(b);
  if (!x || !y) return false;
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(x);
  const [r2, g2, b2] = rgb(y);
  return Math.hypot(r1! - r2!, g1! - g2!, b1! - b2!) < 70;
}

/**
 * Snap (x, z) to the nearest line within `reach`. With a colour, only
 * lines of that colour count; without one, any line does. Null when
 * nothing is close enough.
 */
export function snapToLines<T extends { points: readonly Pt[]; colour: string | null }>(
  x: number,
  z: number,
  lines: readonly T[],
  colour: string | null,
  reach: number,
): { index: number; snap: Snap } | null {
  let best: { index: number; snap: Snap } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (colour && !similarColour(line.colour, colour)) continue;
    const snap = nearestOnPolyline(x, z, line.points);
    if (snap.distance <= reach && (!best || snap.distance < best.snap.distance)) best = { index, snap };
  }
  return best;
}

/** A polyline shifted sideways by `d` (left of travel is positive), mitered at bends. */
export function offsetPolyline(points: readonly Pt[], d: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const here = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const inLen = Math.hypot(here[0] - prev[0], here[1] - prev[1]) || 1;
    const outLen = Math.hypot(next[0] - here[0], next[1] - here[1]) || 1;
    const n1x = i === 0 ? -(next[1] - here[1]) / outLen : -(here[1] - prev[1]) / inLen;
    const n1z = i === 0 ? (next[0] - here[0]) / outLen : (here[0] - prev[0]) / inLen;
    const n2x = i === points.length - 1 ? n1x : -(next[1] - here[1]) / outLen;
    const n2z = i === points.length - 1 ? n1z : (next[0] - here[0]) / outLen;
    let mx = n1x + n2x;
    let mz = n1z + n2z;
    const mLen = Math.hypot(mx, mz) || 1;
    mx /= mLen;
    mz /= mLen;
    const w = d * Math.min(2.5, 1 / Math.max(0.2, mx * n1x + mz * n1z));
    out.push([here[0] + mx * w, here[1] + mz * w]);
  }
  return out;
}

/** Cut a polyline into dashes of `dash` length separated by `gap`. */
export function dashLine(points: readonly Pt[], dash: number, gap: number): Pt[][] {
  const total = polylineLength(points);
  const pieces: Pt[][] = [];
  for (let start = 0; start < total; start += dash + gap) {
    const end = Math.min(total, start + dash);
    const piece: Pt[] = [];
    const a = pointAlong(points, start);
    piece.push([a.x, a.z]);
    let walked = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      walked += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
      if (walked > start && walked < end) piece.push(points[i + 1]!);
    }
    const b = pointAlong(points, end);
    piece.push([b.x, b.z]);
    if (piece.length >= 2) pieces.push(piece);
  }
  return pieces;
}

/** Scene direction of a compass bearing (degrees clockwise from north; north is −z). */
export function bearingVector(bearing: number): { dx: number; dz: number } {
  const r = (bearing * Math.PI) / 180;
  return { dx: Math.sin(r), dz: -Math.cos(r) };
}
