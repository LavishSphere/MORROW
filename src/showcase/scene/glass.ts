import * as THREE from "three";

/**
 * Curtain-wall glass for the future city.
 *
 * One small canvas is painted once: tinted glass panes separated by thin
 * aluminium mullions and floor slabs, with a little per-pane variation so
 * the reflections break up the way real glazing does. Each tower takes a
 * clone with its own repeat, so panes stay the same size on every tower.
 */

/** Width of one glass bay, in world units. */
export const BAY = 1.0;
/** Height of one floor, in world units. */
export const FLOOR = 1.6;

const COLS = 8;
const ROWS = 8;
const CELL = 64;

let shared: { color: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function paint(kind: "color" | "rough"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const mullion = 3;
  const slab = 6;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const v = hash(row * 31 + col * 7);
      const x = col * CELL;
      const y = row * CELL;
      if (kind === "color") {
        // Glass reads dark; its brightness comes from reflections. Panes
        // vary only slightly, with the odd darker one (blinds drawn).
        const shade = 118 + Math.floor(v * 22) - (v > 0.94 ? 28 : 0);
        ctx.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 18})`;
      } else {
        // Roughness: glass is smooth; slight variation keeps it from
        // looking like one mirror.
        const r = 38 + Math.floor(v * 26);
        ctx.fillStyle = `rgb(${r}, ${r}, ${r})`;
      }
      ctx.fillRect(x, y, CELL, CELL);
    }
  }

  // Mullions and floor slabs: light aluminium, matte.
  ctx.fillStyle = kind === "color" ? "#eef2f4" : "#b4b4b4";
  for (let col = 0; col <= COLS; col += 1) {
    ctx.fillRect(col * CELL - mullion / 2, 0, mullion, canvas.height);
  }
  for (let row = 0; row <= ROWS; row += 1) {
    ctx.fillRect(0, row * CELL - slab / 2, canvas.width, slab);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (kind === "color") texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Glass maps sized for a w × h face: panes stay BAY wide and FLOOR tall. */
export function curtainWall(w: number, h: number) {
  if (!shared) shared = { color: paint("color"), rough: paint("rough") };
  const across = Math.max(1, w / BAY) / COLS;
  const up = Math.max(1, h / FLOOR) / ROWS;
  const color = shared.color.clone();
  const rough = shared.rough.clone();
  color.repeat.set(across, up);
  rough.repeat.set(across, up);
  return { color, rough };
}

/**
 * Glass maps for extruded footprints. ExtrudeGeometry writes world-unit
 * UVs on its side walls, so one fixed repeat keeps panes `bay` wide and
 * `floor` tall on every real building, whatever its outline.
 */
export function worldCurtainWall(bay: number, floor: number) {
  if (!shared) shared = { color: paint("color"), rough: paint("rough") };
  const color = shared.color.clone();
  const rough = shared.rough.clone();
  color.repeat.set(1 / (bay * COLS), 1 / (floor * ROWS));
  rough.repeat.set(1 / (bay * COLS), 1 / (floor * ROWS));
  return { color, rough };
}

/** A few cool glass tints, so the skyline is not one flat color. */
export const GLASS_TINTS = ["#7fa9c2", "#8db5c9", "#6f9cb8", "#94bccb", "#86aec4"] as const;
