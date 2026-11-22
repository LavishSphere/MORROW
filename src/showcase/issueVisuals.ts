/**
 * How accessibility issues read on the map: colour, shape, and severity per
 * kind, when markers cluster, and the flat geometry for the problem stretch
 * and the proposed patch. Pure data and math (no three.js, no React) so it
 * can be tested in Node and shared by the 3D layer and the DOM legend.
 */

import type { IssueKind } from "../../shared/issues.ts";

export type Path = readonly (readonly [number, number])[];

/** Marker color per kind of issue; improved issues turn green. */
export const ISSUE_COLOR: Record<IssueKind, string> = {
  // Red-orange, well clear of the autumn trees' amber and rust.
  stairs: "#ff5a1f",
  unmarked_crossing: "#ffd23f",
  no_sidewalk: "#ff3d7f",
  // Violet, not tan: a tan ball on a pole reads as an autumn tree.
  unpaved_path: "#a070ff",
};
/** An improved issue. */
export const FIXED_COLOR = "#2ecc71";
/** Proposed fixes are drawn in MORROW blue so they never pass for the existing city. */
export const PROPOSED_COLOR = "#1488ff";

export type IssueShape = "diamond" | "triangle" | "square" | "circle";

/** Marker head shape per kind, so kinds differ by more than colour. */
export const ISSUE_SHAPE: Record<IssueKind, IssueShape> = {
  stairs: "diamond",
  unmarked_crossing: "triangle",
  no_sidewalk: "square",
  unpaved_path: "circle",
};

/** How hard the barrier is to get past. Higher draws first and wins a cluster. */
export const ISSUE_SEVERITY: Record<IssueKind, number> = {
  stairs: 3,
  no_sidewalk: 2,
  unmarked_crossing: 2,
  unpaved_path: 1,
};

/** Few-word label for the map. */
export const ISSUE_SHORT: Record<IssueKind, string> = {
  stairs: "Stairs, no ramp",
  unmarked_crossing: "No crosswalk",
  no_sidewalk: "No sidewalk",
  unpaved_path: "Unpaved path",
};

/** What the patch on the map is, in a few words. */
export const PATCH_LABEL: Record<IssueKind, string> = {
  stairs: "Ramp beside the stairs",
  unmarked_crossing: "Crosswalk, curb ramps, tactile paving",
  no_sidewalk: "New sidewalk",
  unpaved_path: "Smooth paving",
};

/** Most severe first; ties keep their order. */
export function bySeverity<T extends { kind: IssueKind }>(a: T, b: T) {
  return ISSUE_SEVERITY[b.kind] - ISSUE_SEVERITY[a.kind];
}

/** Camera distance at which a marker is drawn at its modelled size. */
const MARKER_REF_DISTANCE = 24;

/**
 * Marker scale for a camera distance: about the same size on screen at any
 * zoom, a little smaller at street level, capped when far out.
 */
export function markerScale(distance: number) {
  return Math.min(4, Math.max(0.8, distance / MARKER_REF_DISTANCE));
}

/** Beyond this camera distance, nearby markers merge into one with a count. */
export const CLUSTER_FROM = 70;
/** Below this camera distance, the nearest markers get a text label. */
export const LABEL_ZOOM = 45;

/** Grid cell (scene units) for clustering at a camera distance; 0 means no clustering. */
export function clusterCell(distance: number) {
  if (distance < CLUSTER_FROM) return 0;
  // Snap to steps so a slow zoom does not regroup markers every frame.
  const step = 2 ** (Math.round(Math.log2(distance) * 3) / 3);
  return step * 0.1;
}

export type PinInput = { id: string; kind: IssueKind; x: number; z: number; fixed: boolean };

export type Pin = {
  /** Stable key: the issue id, or `cluster:<cell>`. */
  key: string;
  x: number;
  z: number;
  /** Kind of the most severe open issue in the pin (or of any, when all are fixed). */
  kind: IssueKind;
  /** True when every issue in the pin is improved. */
  fixed: boolean;
  ids: string[];
  /** Open (not yet improved) issues in the pin. */
  open: number;
};

/**
 * One pin per issue, or at far zoom one per grid cell with a count. Pins
 * come out most severe first. Cluster positions are the members' mean.
 */
export function clusterPins(issues: readonly PinInput[], cell: number): Pin[] {
  if (cell <= 0) {
    return issues
      .map((issue) => ({
        key: issue.id,
        x: issue.x,
        z: issue.z,
        kind: issue.kind,
        fixed: issue.fixed,
        ids: [issue.id],
        open: issue.fixed ? 0 : 1,
      }))
      .sort(pinOrder);
  }
  const cells = new Map<string, PinInput[]>();
  for (const issue of issues) {
    const key = `${Math.floor(issue.x / cell)},${Math.floor(issue.z / cell)}`;
    const list = cells.get(key);
    if (list) list.push(issue);
    else cells.set(key, [issue]);
  }
  const pins: Pin[] = [];
  for (const [key, members] of cells) {
    const open = members.filter((m) => !m.fixed);
    const lead = [...(open.length > 0 ? open : members)].sort(bySeverity)[0]!;
    const one = members.length === 1;
    pins.push({
      key: one ? lead.id : `cluster:${key}`,
      x: members.reduce((sum, m) => sum + m.x, 0) / members.length,
      z: members.reduce((sum, m) => sum + m.z, 0) / members.length,
      kind: lead.kind,
      fixed: open.length === 0,
      ids: members.map((m) => m.id),
      open: open.length,
    });
  }
  return pins.sort(pinOrder);
}

function pinOrder(a: Pin, b: Pin) {
  if (a.fixed !== b.fixed) return a.fixed ? 1 : -1;
  return ISSUE_SEVERITY[b.kind] - ISSUE_SEVERITY[a.kind] || b.ids.length - a.ids.length;
}

/**
 * Which issues get a text label when zoomed in: the nearest few to the view
 * center, most severe first among them.
 */
export function labelIds(
  issues: readonly PinInput[],
  center: { x: number; z: number },
  distance: number,
  max = 6,
): string[] {
  if (distance >= LABEL_ZOOM) return [];
  const radius = Math.max(8, distance * 0.6);
  return issues
    .map((issue) => ({ issue, d: Math.hypot(issue.x - center.x, issue.z - center.z) }))
    .filter((entry) => entry.d < radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .sort((a, b) => bySeverity(a.issue, b.issue) || a.d - b.d)
    .map((entry) => entry.issue.id);
}

/** Ease for the build-in: quick start, soft landing. Reduced motion is always done. */
export function buildProgress(elapsed: number, duration: number, reducedMotion: boolean) {
  if (reducedMotion || duration <= 0) return 1;
  const t = Math.min(1, Math.max(0, elapsed / duration));
  return 1 - (1 - t) ** 3;
}

// —— Flat geometry ——————————————————————————————————————————————————————

export function pathLength(path: Path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1]);
  }
  return total;
}

/** Pieces of a path for a dashed line: `dash` drawn, `gap` skipped. */
export function dashes(path: Path, dash: number, gap: number): [number, number][][] {
  const out: [number, number][][] = [];
  let current: [number, number][] = [];
  let drawing = true;
  let left = dash;
  for (let i = 0; i < path.length - 1; i += 1) {
    let [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    let len = Math.hypot(bx - ax, bz - az);
    if (drawing && current.length === 0) current.push([ax, az]);
    while (len > 1e-6) {
      const step = Math.min(left, len);
      const t = step / len;
      ax += (bx - ax) * t;
      az += (bz - az) * t;
      len -= step;
      left -= step;
      if (drawing) current.push([ax, az]);
      if (left <= 1e-6) {
        if (drawing && current.length > 1) out.push(current);
        drawing = !drawing;
        current = drawing ? [[ax, az]] : [];
        left = drawing ? dash : gap;
      }
    }
  }
  if (drawing && current.length > 1) out.push(current);
  return out;
}

type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** One flat quad (two triangles) and where along its path it sits, 0–1. */
type Quad = { along: number; positions: number[]; color: Rgb };

/** Triangles with a color per vertex, ordered from the start of the path to its end. */
export type FlatMesh = { positions: number[]; colors: number[] };

function flatten(quads: Quad[]): FlatMesh {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const quad of [...quads].sort((a, b) => a.along - b.along)) {
    positions.push(...quad.positions);
    for (let v = 0; v < quad.positions.length / 3; v += 1) colors.push(...quad.color);
  }
  return { positions, colors };
}

/** Quads of a flat band along a path, `offset` to one side, `half` wide each way. */
function bandQuads(path: Path, half: number, y: number, color: Rgb, offset = 0): Quad[] {
  const total = pathLength(path) || 1;
  // Drop repeated points so every segment has a direction.
  const pts = path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1]![0], p[1] - path[i - 1]![1]) >= 1e-4);
  if (pts.length < 2) return [];
  const normals = pts.slice(0, -1).map((p, i) => {
    const q = pts[i + 1]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [-(q[1] - p[1]) / len, (q[0] - p[0]) / len] as const;
  });
  // Mitered corners: each joint shares one left and one right point between
  // its two segments, so bends have no wedge gaps and no doubled overlaps.
  const corner = pts.map((_, i) => {
    const a = normals[Math.max(0, i - 1)]!;
    const b = normals[Math.min(normals.length - 1, i)]!;
    let mx = a[0] + b[0];
    let mz = a[1] + b[1];
    const m = Math.hypot(mx, mz);
    if (m < 1e-6) return b; // A full U-turn: no sensible miter.
    mx /= m;
    mz /= m;
    // Keep the band's width through the bend, within a limit on sharp turns.
    const stretch = 1 / Math.max(0.5, mx * b[0] + mz * b[1]);
    return [mx * stretch, mz * stretch] as const;
  });
  const l = offset - half;
  const r = offset + half;
  const quads: Quad[] = [];
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    let [anx, anz] = corner[i]!;
    let [bnx, bnz] = corner[i + 1]!;
    // A short piece far off-centre on the inside of a bend can fold over its
    // miter; that piece falls back to its own square ends.
    const along = (nx: number, nz: number, k: number) => (bx - ax) * (nx * k) + (bz - az) * (nz * k);
    const room = len * len;
    for (const k of [l, r]) {
      if (along(bnx, bnz, k) - along(anx, anz, k) <= -room) {
        [anx, anz] = normals[i]!;
        [bnx, bnz] = normals[i]!;
        break;
      }
    }
    const aL = [ax + anx * l, y, az + anz * l];
    const aR = [ax + anx * r, y, az + anz * r];
    const bL = [bx + bnx * l, y, bz + bnz * l];
    const bR = [bx + bnx * r, y, bz + bnz * r];
    // Counter-clockwise seen from above, so the face points up.
    quads.push({ along: (walked + len / 2) / total, positions: [...aL, ...aR, ...bL, ...aR, ...bR, ...bL], color });
    walked += len;
  }
  return quads;
}

/** Evenly spaced points along a path with their direction and place along it. */
function stations(path: Path, spacing: number) {
  const total = pathLength(path) || 1;
  const out: { x: number; z: number; ux: number; uz: number; along: number }[] = [];
  let walked = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) continue;
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    for (let t = spacing / 2; t < len; t += spacing) {
      out.push({ x: ax + ux * t, z: az + uz * t, ux, uz, along: (walked + t) / total });
    }
    walked += len;
  }
  return out;
}

/** A flat rectangle centred on (x, z): `depth` along (ux, uz), `width` across. */
function rectQuad(x: number, z: number, ux: number, uz: number, depth: number, width: number, y: number) {
  const hx = (ux * depth) / 2;
  const hz = (uz * depth) / 2;
  const wx = (-uz * width) / 2;
  const wz = (ux * width) / 2;
  const a = [x - hx - wx, y, z - hz - wz];
  const b = [x + hx - wx, y, z + hz - wz];
  const c = [x - hx + wx, y, z - hz + wz];
  const d = [x + hx + wx, y, z + hz + wz];
  return [...a, ...c, ...b, ...c, ...d, ...b];
}

/** Bars across a path: stair treads, zebra stripes. */
function barQuads(path: Path, spacing: number, depth: number, width: number, y: number, color: Rgb): Quad[] {
  return stations(path, spacing).map((s) => ({
    along: s.along,
    positions: rectQuad(s.x, s.z, s.ux, s.uz, depth, width, y),
    color,
  }));
}

/** A pad at each end of a path, just inside it (curb ramps, tactile paving). */
function endQuads(path: Path, depth: number, width: number, inset: number, y: number, color: Rgb): Quad[] {
  if (path.length < 2) return [];
  const ends: { p: readonly [number, number]; q: readonly [number, number]; along: number }[] = [
    { p: path[0]!, q: path[1]!, along: 0 },
    { p: path[path.length - 1]!, q: path[path.length - 2]!, along: 1 },
  ];
  return ends.map(({ p, q, along }) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const ux = (q[0] - p[0]) / len;
    const uz = (q[1] - p[1]) / len;
    const at = Math.min(inset, len / 2);
    return { along, positions: rectQuad(p[0] + ux * at, p[1] + uz * at, ux, uz, depth, width, y), color };
  });
}

/** A crosswalk is about 3 m wide (along the road). */
const CROSSWALK_WIDTH = 0.46;
/** How far a curb ramp runs in from each end of a crossing. */
const CURB_DEPTH = 0.16;

/** The path's first and last points only. */
function straightLine(path: Path): Path {
  return path.length < 2 ? path : [path[0]!, path[path.length - 1]!];
}

/** A straight line shortened by `cut` at both ends (kept whole when too short). */
function trimEnds(line: Path, cut: number): Path {
  if (line.length < 2) return line;
  const [a, b] = [line[0]!, line[line.length - 1]!];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len <= cut * 3) return line;
  const ux = (b[0] - a[0]) / len;
  const uz = (b[1] - a[1]) / len;
  return [
    [a[0] + ux * cut, a[1] + uz * cut],
    [b[0] - ux * cut, b[1] - uz * cut],
  ];
}

/** Half the drawn road, the same constant the fixes have always used. */
export const ROAD_HALF = 0.62;
/** Where a new sidewalk's centre line sits from the road's centre line. */
export const SIDEWALK_OFFSET = ROAD_HALF + 0.32;
/** A stairs ramp runs this far to the side of the stairs. */
export const RAMP_OFFSET = 0.46;

export type PatchIssue = { kind: IssueKind; path: Path; sides?: "both" | "left" | "right" };

/**
 * Which side offsets a missing sidewalk is on. Scene x is east and z is
 * south, so a band's positive offset is on the right of the way's direction,
 * and OpenStreetMap's left side is negative.
 */
export function sidewalkOffsets(sides: PatchIssue["sides"]) {
  if (sides === "left") return [-SIDEWALK_OFFSET];
  if (sides === "right") return [SIDEWALK_OFFSET];
  return [-SIDEWALK_OFFSET, SIDEWALK_OFFSET];
}

const WARN_Y = 0.085;

/**
 * The problem stretch as a dashed line in the kind's colour. For a missing
 * sidewalk the dashes run exactly where the new sidewalk would go.
 */
export function problemMesh(issue: PatchIssue, half = 0.14, color = ISSUE_COLOR[issue.kind]): FlatMesh {
  const rgb = hexToRgb(color);
  const offsets = issue.kind === "no_sidewalk" ? sidewalkOffsets(issue.sides) : [0];
  const quads: Quad[] = [];
  for (const piece of dashes(issue.path, 0.55, 0.35)) {
    for (const offset of offsets) quads.push(...bandQuads(piece, half, WARN_Y, rgb, offset));
  }
  return flatten(quads);
}

/** The same stretch as one solid band, for the selected or hovered issue. */
export function stretchMesh(issue: PatchIssue, half: number, y: number, color: string): FlatMesh {
  const rgb = hexToRgb(color);
  const offsets = issue.kind === "no_sidewalk" ? sidewalkOffsets(issue.sides) : [0];
  return flatten(offsets.flatMap((offset) => bandQuads(issue.path, half, y, rgb, offset)));
}

const STONE: Rgb = hexToRgb("#59636a");
const DIRT: Rgb = hexToRgb("#9a7550");

/** What reads in 3D today: stair treads and the dirt of an unpaved path. */
export function todayMesh(issue: PatchIssue): FlatMesh {
  if (issue.kind === "stairs") return flatten(barQuads(issue.path, 0.18, 0.08, 0.42, 0.07, STONE));
  if (issue.kind === "unpaved_path") return flatten(bandQuads(issue.path, 0.2, 0.045, DIRT));
  return { positions: [], colors: [] };
}

const SURFACE: Rgb = hexToRgb("#eef2f4");
const SIDEWALK: Rgb = hexToRgb("#e3e6e2");
const PAVING: Rgb = hexToRgb("#ece7dc");
const STRIPE: Rgb = hexToRgb("#ffffff");
const TACTILE: Rgb = hexToRgb("#ffd23f");
const CURB: Rgb = hexToRgb("#cfd6da");

/**
 * The proposed fix, built from the issue's own way: `surface` is the new
 * ground (vertex coloured), `edges` the glowing blue trim that marks it as
 * proposed. Both run start to end, so revealing a prefix of the triangles
 * builds the fix along the street.
 */
export function patchMesh(issue: PatchIssue): { surface: FlatMesh; edges: FlatMesh } {
  const blue = hexToRgb(PROPOSED_COLOR);
  const surface: Quad[] = [];
  const edges: Quad[] = [];
  switch (issue.kind) {
    case "stairs": {
      // A ramp beside the stairs, with a handrail glow on each side.
      surface.push(...bandQuads(issue.path, 0.2, 0.11, SURFACE, RAMP_OFFSET));
      edges.push(...bandQuads(issue.path, 0.025, 0.13, blue, RAMP_OFFSET + 0.22));
      edges.push(...bandQuads(issue.path, 0.025, 0.13, blue, RAMP_OFFSET - 0.22));
      break;
    }
    case "unmarked_crossing": {
      // Straight across, first point to last, so a bent OpenStreetMap way
      // still gives one clean zebra instead of rotated, overlapping bars.
      const line = straightLine(issue.path);
      const inner = trimEnds(line, CURB_DEPTH);
      // About 3 m wide, like a real crosswalk; bars run with the traffic.
      surface.push(...barQuads(inner, 0.2, 0.1, CROSSWALK_WIDTH, 0.09, STRIPE));
      // A stop line on each approach, a little back from the stripes.
      surface.push(...bandQuads(inner, 0.025, 0.09, STRIPE, CROSSWALK_WIDTH / 2 + 0.22));
      surface.push(...bandQuads(inner, 0.025, 0.09, STRIPE, -(CROSSWALK_WIDTH / 2 + 0.22)));
      // Curb ramps at the two ends, tactile paving at their outer edge; none of it overlaps the stripes.
      surface.push(...endQuads(line, CURB_DEPTH, CROSSWALK_WIDTH + 0.1, CURB_DEPTH / 2, 0.092, CURB));
      surface.push(...endQuads(line, 0.07, CROSSWALK_WIDTH, 0.04, 0.096, TACTILE));
      edges.push(...bandQuads(line, 0.022, 0.095, blue, CROSSWALK_WIDTH / 2 + 0.06));
      edges.push(...bandQuads(line, 0.022, 0.095, blue, -(CROSSWALK_WIDTH / 2 + 0.06)));
      break;
    }
    case "no_sidewalk": {
      for (const offset of sidewalkOffsets(issue.sides)) {
        const outward = Math.sign(offset);
        surface.push(...bandQuads(issue.path, 0.22, 0.06, SIDEWALK, offset));
        // The curb, between the road and the new sidewalk.
        surface.push(...bandQuads(issue.path, 0.035, 0.075, CURB, offset - outward * 0.24));
        edges.push(...bandQuads(issue.path, 0.02, 0.08, blue, offset + outward * 0.23));
      }
      break;
    }
    case "unpaved_path": {
      surface.push(...bandQuads(issue.path, 0.24, 0.06, PAVING));
      edges.push(...bandQuads(issue.path, 0.02, 0.07, blue, 0.25));
      edges.push(...bandQuads(issue.path, 0.02, 0.07, blue, -0.25));
      break;
    }
  }
  return { surface: flatten(surface), edges: flatten(edges) };
}

/** Join several flat meshes into one buffer pair. */
export function mergeFlat(meshes: readonly FlatMesh[]): FlatMesh {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const mesh of meshes) {
    for (const v of mesh.positions) positions.push(v);
    for (const c of mesh.colors) colors.push(c);
  }
  return { positions, colors };
}
