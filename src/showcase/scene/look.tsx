import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FootprintGrid } from "./trafficLanes.ts";

/**
 * Visual presets for the city. Golden hour is the default; `?look=` in the
 * URL picks another one.
 *
 * "classic" changes nothing: every field is empty, so each hook elsewhere
 * falls back to the scene's own values. The other looks only restyle what is
 * already drawn (palette, lights, sky, small shader tweaks on existing
 * materials) and add a handful of merged meshes. No post passes.
 *
 *   (none), ?look=a  Golden hour diorama
 *   ?look=classic    The look before golden hour
 *   ?look=b          Living streets
 *   ?look=c          Clean toy
 */

type Vec3 = readonly [number, number, number];
type Ring = readonly (readonly [number, number])[];

type Light = { position: Vec3; color: string; intensity: number } & Record<string, unknown>;

type SkyLook = {
  zenith: string;
  mid: string;
  /** Horizon toward the sun, and away from it. Same color for an even haze. */
  horizonSun: string;
  horizonAway: string;
  glow: readonly [string, number];
  halo: readonly [string, number];
  cloudShade: string;
  cloudLit: readonly [string, number];
  /** smoothstep edges on the cloud noise: higher means fewer clouds. */
  cloudCover: readonly [number, number];
};

type Palette = Partial<{
  lawn: string;
  road: string;
  sidewalk: string;
  footway: string;
  path: string;
  park: string;
  water: string;
  stream: string;
  stone: string;
  metal: string;
  siding: readonly string[];
  shingle: readonly string[];
  glass: readonly string[];
}>;

export type Look = {
  id: "today" | "a" | "b" | "c";
  exposure?: number;
  background?: { args: [string] };
  fog?: { args: [string, number, number] };
  hemi?: { args: [string, string, number] };
  sun?: Light;
  fill?: Light;
  sky?: SkyLook;
  palette: Palette;
  trees?: { green: readonly string[]; autumn: readonly string[] };
  /** Darken walls toward the ground: fake ambient occlusion, by world height. */
  ao?: { floor: number; height: number };
  /** Soft fresnel rim on buildings and trees. */
  rim?: { color: string; strength: number; power: number };
  /** Large, faint mottling on the lawn so it is not one flat color. */
  lawnNoise?: { strength: number; scale: number };
  /**
   * Baked sun shadows: every building surface projected onto the ground
   * along the key light, drawn once as a multiply layer. The scene has no
   * shadow maps, so this is what makes a low sun read.
   */
  sunShadows?: { color: string };
  /** Flat roofs take the light instead of mirroring the sky. */
  roofs?: { metalness: number; roughness: number };
  /** Matte glass: no clearcoat, little metalness, rough. */
  matte?: boolean;
  /** Scrolling ripples on water normals. */
  shimmer?: boolean;
  /** Rounded, smooth-shaded tree canopies. */
  roundTrees?: boolean;
  /** Lane markings, crosswalks, curbs, and street trees. */
  streets?: boolean;
  /** Small boxes and tanks on flat roofs. */
  rooftops?: boolean;
  /** Faint lit windows on glass towers. */
  windows?: boolean;
};

const TODAY: Look = { id: "today", palette: {} };

const GOLDEN: Look = {
  id: "a",
  exposure: 1,
  background: { args: ["#efc8a4"] },
  fog: { args: ["#efc8a4", 95, 300] },
  // Low sun from the side; the faces turned away fall into a cool fill.
  hemi: { args: ["#ffcf9e", "#4a4064", 0.9] },
  sun: { position: [100, 58, -70], color: "#ffa95e", intensity: 2.8 },
  fill: { position: [-40, 22, 60], color: "#7f9cff", intensity: 0.55 },
  sky: {
    zenith: "#3e5c9a",
    mid: "#8aa3cf",
    horizonSun: "#ffbb80",
    horizonAway: "#dcc7bf",
    glow: ["#ffa860", 0.55],
    halo: ["#ffd9a0", 0.7],
    cloudShade: "#b59cab",
    cloudLit: ["#ffc58e", 0.55],
    cloudCover: [0.52, 0.8],
  },
  palette: {
    lawn: "#86a04a",
    road: "#4d4743",
    sidewalk: "#e4d6c0",
    footway: "#e7d5b6",
    path: "#dcc398",
    park: "#5f8c44",
    water: "#2f7894",
    stream: "#3d8eb0",
    stone: "#e6dac6",
    metal: "#f0dcc0",
    siding: ["#f7e9d4", "#f0d3a8", "#d9d1cb", "#e8c59b"],
    shingle: ["#5c4a47", "#7d4c36", "#4b4d5f"],
  },
  trees: {
    green: ["#4e7838", "#5e883b", "#6f9543", "#82a14a"],
    autumn: ["#cf923a", "#dba64c", "#c76f2c"],
  },
  ao: { floor: 0.66, height: 0.9 },
  lawnNoise: { strength: 0.2, scale: 0.045 },
  roofs: { metalness: 0.1, roughness: 0.8 },
  sunShadows: { color: "#c3bcd6" },
};

const STREETS: Look = {
  id: "b",
  palette: {
    lawn: "#7a9a62",
    road: "#454b50",
    sidewalk: "#d4d4cc",
  },
  ao: { floor: 0.72, height: 0.6 },
  streets: true,
  rooftops: true,
  windows: true,
};

const TOY: Look = {
  id: "c",
  exposure: 0.88,
  background: { args: ["#dcedf9"] },
  fog: { args: ["#dcedf9", 200, 400] },
  hemi: { args: ["#ffffff", "#6f86a0", 0.95] },
  sun: { position: [40, 44, 16], color: "#fff6ea", intensity: 2 },
  fill: { position: [-30, 20, 34], color: "#ffd9ea", intensity: 0.45 },
  sky: {
    zenith: "#4f9ff0",
    mid: "#8ac6f6",
    horizonSun: "#dcedf9",
    horizonAway: "#dcedf9",
    glow: ["#fff2dc", 0.12],
    halo: ["#ffffff", 0.35],
    cloudShade: "#dbe6f2",
    cloudLit: ["#ffffff", 0.2],
    cloudCover: [0.56, 0.72],
  },
  palette: {
    lawn: "#86c765",
    road: "#8995a3",
    sidewalk: "#f5f2ea",
    footway: "#f7ecd8",
    path: "#f0dcb6",
    park: "#7cc779",
    water: "#4fb4ea",
    stream: "#63c2f0",
    stone: "#f4f0e9",
    metal: "#f3f5f7",
    siding: ["#ffdccd", "#d4ebfa", "#fff0bf", "#dcf2d2"],
    shingle: ["#ea7f69", "#6d9fe2", "#9a84da"],
    glass: ["#bfe3f2", "#a6e2da", "#a9c3ef", "#f3dcbf", "#c2e7cd", "#cad4ea", "#b5c3f2", "#e6eff6"],
  },
  trees: {
    green: ["#66bd6a", "#8ed268", "#4fae79"],
    autumn: ["#f6bb57", "#f39b6b"],
  },
  ao: { floor: 0.78, height: 0.5 },
  rim: { color: "#ffffff", strength: 0.16, power: 3 },
  matte: true,
  shimmer: true,
  roundTrees: true,
  sunShadows: { color: "#bfcbe6" },
};

const PRESETS: Record<string, Look> = {
  classic: TODAY,
  today: TODAY,
  a: GOLDEN,
  golden: GOLDEN,
  b: STREETS,
  streets: STREETS,
  c: TOY,
  toy: TOY,
};

function pickLook(): Look {
  if (typeof window === "undefined") return GOLDEN;
  const key = new URLSearchParams(window.location.search).get("look")?.toLowerCase() ?? "";
  return PRESETS[key] ?? GOLDEN;
}

/** The look for this page load. */
export const LOOK: Look = pickLook();

/** Same direction as the key light, for the sky's sun disk. */
export const LOOK_SUN: Vec3 | null = LOOK.sun?.position ?? null;

/* —— Sky —— */

/** "#rrggbb" → GLSL vec3. The sky shader writes display colors directly, with no conversion. */
function vec3(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3));
  return `vec3(${c.join(", ")})`;
}

/** Rewrite the sky's fixed colors for this look. Today's shader is returned untouched. */
export function lookSky(fragment: string): string {
  const sky = LOOK.sky;
  if (!sky) return fragment;
  const swaps: [string, string][] = [
    ["vec3 zenith = vec3(0.15, 0.36, 0.74);", `vec3 zenith = ${vec3(sky.zenith)};`],
    ["vec3 midSky = vec3(0.38, 0.60, 0.89);", `vec3 midSky = ${vec3(sky.mid)};`],
    [
      "vec3 horizon = vec3(0.81, 0.88, 0.92);",
      // Warm toward the sun, cooler away from it.
      `float facing = clamp(dot(normalize(dir.xz + vec2(1e-4)), normalize(uSun.xz)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 horizon = mix(${vec3(sky.horizonAway)}, ${vec3(sky.horizonSun)}, facing * facing);`,
    ],
    [
      "col += vec3(1.0, 0.90, 0.74) * pow(sun, 6.0) * 0.18;",
      `col += ${vec3(sky.glow[0])} * pow(sun, 4.0) * ${sky.glow[1].toFixed(3)};`,
    ],
    [
      "col += vec3(1.0, 0.95, 0.86) * pow(sun, 80.0) * 0.45;",
      `col += ${vec3(sky.halo[0])} * pow(sun, 60.0) * ${sky.halo[1].toFixed(3)};`,
    ],
    ["float cover = smoothstep(0.5, 0.78, shape);", `float cover = smoothstep(${sky.cloudCover[0].toFixed(3)}, ${sky.cloudCover[1].toFixed(3)}, shape);`],
    ["vec3(0.70, 0.75, 0.82), smoothstep(0.45, 0.85, thick)", `${vec3(sky.cloudShade)}, smoothstep(0.45, 0.85, thick)`],
    [
      "cloud += vec3(1.0, 0.92, 0.80) * pow(sun, 5.0) * 0.22;",
      `cloud += ${vec3(sky.cloudLit[0])} * pow(sun, 3.0) * ${sky.cloudLit[1].toFixed(3)};`,
    ],
  ];
  let out = fragment;
  for (const [from, to] of swaps) {
    if (!out.includes(from) && import.meta.env.DEV) console.warn(`look: sky line not found: ${from}`);
    out = out.replace(from, to);
  }
  return out;
}

/* —— Material tweaks (one onBeforeCompile per material, no extra passes) —— */

type Patch = {
  ao?: boolean;
  rim?: boolean;
  lawn?: boolean;
  shimmer?: boolean;
  /** Ground that receives the baked sun shadows. */
  shadow?: boolean;
};

/** Shared clock for the water ripples. */
const shimmerTime = { value: 0 };

/**
 * The baked shadow map: a top-down mask over the city's box, painted once
 * per city build. Ground materials read it by world position.
 */
const shadowMask = {
  uLookShadow: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) as THREE.Texture },
  /** minX, minZ, 1 / width, 1 / depth */
  uLookShadowBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  uLookShadowTint: { value: new THREE.Color(LOOK.sunShadows?.color ?? "#ffffff") },
};
shadowMask.uLookShadow.value.needsUpdate = true;

function patchMaterial(material: THREE.Material, patch: Patch) {
  const ao = patch.ao ? LOOK.ao : undefined;
  const rim = patch.rim ? LOOK.rim : undefined;
  const lawn = patch.lawn ? LOOK.lawnNoise : undefined;
  const shimmer = patch.shimmer && LOOK.shimmer;
  const shadow = patch.shadow && LOOK.sunShadows;
  if (!ao && !rim && !lawn && !shimmer && !shadow) return;
  const key = `look-${LOOK.id}-${ao ? "ao" : ""}${rim ? "rim" : ""}${lawn ? "lawn" : ""}${shimmer ? "sh" : ""}${shadow ? "sd" : ""}`;
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLookWorld;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
  vec4 lookWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    lookWorld = instanceMatrix * lookWorld;
  #endif
  vLookWorld = (modelMatrix * lookWorld).xyz;`,
      );
    let head = "varying vec3 vLookWorld;\n";
    let afterColor = "";
    let afterNormal = "";
    let beforeOut = "";
    if (ao) {
      shader.uniforms.uLookAo = { value: new THREE.Vector2(ao.floor, ao.height) };
      head += "uniform vec2 uLookAo;\n";
      afterColor += "diffuseColor.rgb *= mix(uLookAo.x, 1.0, smoothstep(0.0, uLookAo.y, vLookWorld.y));\n";
    }
    if (lawn) {
      shader.uniforms.uLookLawn = { value: new THREE.Vector2(lawn.strength, lawn.scale) };
      head += `uniform vec2 uLookLawn;
float lookHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lookNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lookHash(i), lookHash(i + vec2(1, 0)), u.x), mix(lookHash(i + vec2(0, 1)), lookHash(i + vec2(1, 1)), u.x), u.y);
}
`;
      afterColor += `{
  float n = lookNoise(vLookWorld.xz * uLookLawn.y) * 0.65 + lookNoise(vLookWorld.xz * uLookLawn.y * 3.7) * 0.35;
  diffuseColor.rgb *= 1.0 + (n - 0.5) * uLookLawn.x * 2.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.02, 0.86), smoothstep(0.55, 0.8, n));
}
`;
    }
    if (shimmer) {
      shader.uniforms.uLookTime = shimmerTime;
      head += "uniform float uLookTime;\n";
      afterNormal += `{
  vec2 p = vLookWorld.xz;
  float t = uLookTime;
  vec3 w = vec3(
    sin(p.x * 2.1 + t * 1.3) + sin(p.x * 0.7 - p.y * 1.9 + t * 0.9),
    0.0,
    cos(p.y * 2.4 - t * 1.1) + cos(p.y * 0.8 + p.x * 1.6 - t * 0.7)
  ) * 0.07;
  normal = normalize(normal + (viewMatrix * vec4(w, 0.0)).xyz);
}
`;
    }
    if (rim) {
      const c = new THREE.Color(rim.color);
      shader.uniforms.uLookRim = { value: new THREE.Vector4(c.r, c.g, c.b, rim.strength) };
      head += "uniform vec4 uLookRim;\n";
      beforeOut += `{
  float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  outgoingLight += uLookRim.rgb * pow(1.0 - facing, ${rim.power.toFixed(2)}) * uLookRim.w;
}
`;
    }
    if (shadow) {
      Object.assign(shader.uniforms, shadowMask);
      head += "uniform sampler2D uLookShadow;\nuniform vec4 uLookShadowBox;\nuniform vec3 uLookShadowTint;\n";
      beforeOut += `{
  vec2 suv = (vLookWorld.xz - uLookShadowBox.xy) * uLookShadowBox.zw;
  float inBox = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float shade = texture2D(uLookShadow, suv).r * inBox;
  outgoingLight *= mix(vec3(1.0), uLookShadowTint, shade);
}
`;
    }
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${head}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${afterColor}`)
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>\n${afterNormal}`)
      .replace("#include <opaque_fragment>", `${beforeOut}#include <opaque_fragment>`);
  };
  material.needsUpdate = true;
}

type LawnProps = {
  color?: string;
  onBeforeCompile?: THREE.Material["onBeforeCompile"];
  customProgramCacheKey?: THREE.Material["customProgramCacheKey"];
};

/** Props spread onto the lawn's material. Empty for today. */
export const LOOK_LAWN: LawnProps = (() => {
  const out: LawnProps = {};
  if (LOOK.palette.lawn) out.color = LOOK.palette.lawn;
  if (LOOK.lawnNoise || LOOK.sunShadows) {
    const probe = new THREE.MeshStandardMaterial();
    patchMaterial(probe, { lawn: true, shadow: true });
    out.onBeforeCompile = probe.onBeforeCompile;
    out.customProgramCacheKey = probe.customProgramCacheKey;
    probe.dispose();
  }
  return out;
})();

/** Tree colors for this look, or the city's own. */
export function lookTrees<T extends readonly string[]>(green: T, autumn: readonly string[]) {
  return LOOK.trees ?? { green, autumn };
}

/** Canopy shape for this look, or null to keep the faceted one. */
export function lookCanopy(): THREE.BufferGeometry | null {
  if (!LOOK.roundTrees) return null;
  // Same triangle count as the faceted crown, but round and smooth shaded.
  return new THREE.IcosahedronGeometry(0.64, 1).scale(1, 1.06, 1).translate(0, 1.18, 0);
}

type Surfaces = Record<string, THREE.Material>;
type Restyle = {
  glass: THREE.Material[];
  surfaces: Surfaces;
  houses: { siding: THREE.Material[]; shingles: THREE.Material[] };
  looks: Record<string, THREE.Material>;
  masonry: THREE.Material[];
  bridges: THREE.Material[];
};

const styled = new WeakSet<THREE.Material>();
let windowTexture: THREE.CanvasTexture | null = null;

/** Lit and dark windows on a 16 × 16 grid of bays and floors. */
function windowsMap() {
  if (windowTexture) return windowTexture;
  const cells = 16;
  const cell = 32;
  const canvas = document.createElement("canvas");
  canvas.width = cells * cell;
  canvas.height = cells * cell;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < cells; row += 1) {
      for (let col = 0; col < cells; col += 1) {
        const h = Math.abs(Math.sin(row * 91.7 + col * 37.3) * 43758.5453) % 1;
        if (h > 0.13) continue;
        // Warm office light, some cooler, a few brighter.
        const warm = h < 0.1;
        const k = 0.55 + (h * 4) % 0.45;
        const [r, g, b] = warm ? [255, 196, 92] : [190, 222, 255];
        ctx.fillStyle = `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
        ctx.fillRect(col * cell + 3, row * cell + 5, cell - 6, cell - 9);
      }
    }
  }
  windowTexture = new THREE.CanvasTexture(canvas);
  windowTexture.wrapS = THREE.RepeatWrapping;
  windowTexture.wrapT = THREE.RepeatWrapping;
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  return windowTexture;
}

function setColor(material: THREE.Material | undefined, hex: string | undefined) {
  if (!material || !hex || !("color" in material)) return;
  (material.color as THREE.Color).set(hex);
}

function restyle(all: Restyle) {
  const p = LOOK.palette;
  const { surfaces } = all;
  setColor(surfaces.road, p.road);
  setColor(surfaces.farDeck, p.road);
  setColor(surfaces.sidewalk, p.sidewalk);
  setColor(surfaces.footway, p.footway);
  setColor(surfaces.path, p.path);
  setColor(surfaces.park, p.park);
  setColor(surfaces.water, p.water);
  setColor(surfaces.stream, p.stream);
  setColor(surfaces.stone, p.stone);
  setColor(surfaces.metal, p.metal);
  all.houses.siding.forEach((m, i) => setColor(m, p.siding?.[i]));
  all.houses.shingles.forEach((m, i) => setColor(m, p.shingle?.[i]));
  all.glass.forEach((m, i) => setColor(m, p.glass?.[i]));
  if (LOOK.streets && surfaces.line) surfaces.line.visible = false;

  for (const m of all.glass) {
    const glass = m as THREE.MeshPhysicalMaterial;
    if (LOOK.matte) {
      glass.metalness = 0.12;
      glass.roughnessMap = null;
      glass.roughness = 0.62;
      glass.clearcoat = 0;
      glass.envMapIntensity = 0.55;
    }
    if (LOOK.windows && glass.map) {
      const map = windowsMap().clone();
      map.repeat.set(glass.map.repeat.x / 2, glass.map.repeat.y / 2);
      glass.emissiveMap = map;
      glass.emissive.set("#ffffff");
      glass.emissiveIntensity = 0.7;
    }
  }
  if (LOOK.matte) {
    for (const m of [...all.houses.siding, ...all.houses.shingles, ...all.masonry]) {
      (m as THREE.MeshStandardMaterial).roughness = 1;
    }
    const metal = surfaces.metal as THREE.MeshStandardMaterial | undefined;
    if (metal) {
      metal.metalness = 0.05;
      metal.roughness = 0.85;
    }
    const water = surfaces.water as THREE.MeshStandardMaterial | undefined;
    if (water) water.roughness = 0.18;
  }
  const roof = surfaces.metal as THREE.MeshStandardMaterial | undefined;
  if (LOOK.roofs && roof) {
    roof.metalness = LOOK.roofs.metalness;
    roof.roughness = LOOK.roofs.roughness;
  }
  if (LOOK.roundTrees && all.looks.leaves) {
    (all.looks.leaves as THREE.MeshStandardMaterial).flatShading = false;
    all.looks.leaves.needsUpdate = true;
  }

  const buildings = [
    ...all.glass,
    ...all.houses.siding,
    ...all.houses.shingles,
    ...all.masonry,
    surfaces.stone,
    surfaces.metal,
  ].filter((m): m is THREE.Material => Boolean(m));
  for (const m of buildings) patchMaterial(m, { ao: true, rim: true });
  if (all.looks.leaves) patchMaterial(all.looks.leaves, { rim: true });
  for (const m of [surfaces.water, surfaces.stream]) if (m) patchMaterial(m, { shimmer: true, shadow: true });
  for (const name of ["road", "farDeck", "sidewalk", "footway", "path", "park"]) {
    const m = surfaces[name];
    if (m) patchMaterial(m, { shadow: true });
  }
}

/**
 * Apply this look to the city's materials. Runs once per material set; a
 * no-op for today's look.
 */
export function useLook(all: Restyle) {
  useMemo(() => {
    if (LOOK.id === "today") return;
    const fresh = [...all.glass, ...all.masonry, ...all.bridges, ...Object.values(all.surfaces)].some(
      (m) => !styled.has(m),
    );
    if (!fresh) return;
    restyle(all);
    for (const m of [...all.glass, ...all.masonry, ...all.bridges, ...Object.values(all.surfaces)]) styled.add(m);
  }, [all.glass, all.surfaces, all.houses, all.looks, all.masonry, all.bridges]);
}

/* —— Extra detail meshes: street markings, street trees, rooftop units —— */

type WayLike = {
  points: Ring;
  halfWidth: number;
  layer: string;
  highway: string | null;
  lanes: number | null;
  oneway: 1 | -1 | 0;
  indoor: boolean;
  bridge?: boolean;
};

type Parsed = {
  ways: readonly WayLike[];
  buildings: readonly { ring: Ring }[];
  water: readonly { ring: Ring }[];
};

const MAJOR = new Set(["motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link", "secondary_link"]);
const MINOR = new Set(["tertiary", "tertiary_link", "residential", "unclassified", "living_street"]);

const WHITE = new THREE.Color("#f4f2ea");
const YELLOW = new THREE.Color("#f2c443");
const CURB = new THREE.Color("#c9c5bb");

class Paint {
  pos: number[] = [];
  col: number[] = [];

  quad(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], d: readonly [number, number], y: number, color: THREE.Color) {
    // a b c d around the quad; wind both triangles to face up.
    const tri = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]) => {
      const cross = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
      const [s, t] = cross >= 0 ? [q, r] : [r, q];
      this.pos.push(p[0], y, p[1], s[0], y, s[1], t[0], y, t[1]);
      for (let i = 0; i < 3; i += 1) this.col.push(color.r, color.g, color.b);
    };
    tri(a, b, c);
    tri(a, c, d);
  }

  /** A straight bar from p to q, `half` wide, shifted `offset` to the left. */
  bar(p: readonly [number, number], q: readonly [number, number], offset: number, half: number, y: number, color: THREE.Color) {
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const nx = -dz / len;
    const nz = dx / len;
    const o1 = offset - half;
    const o2 = offset + half;
    this.quad(
      [p[0] + nx * o1, p[1] + nz * o1],
      [q[0] + nx * o1, q[1] + nz * o1],
      [q[0] + nx * o2, q[1] + nz * o2],
      [p[0] + nx * o2, p[1] + nz * o2],
      y,
      color,
    );
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    const normals = new Float32Array(this.pos.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const key = (p: readonly [number, number]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

/** Polyline pieces of `points` with the stretch within `cut(i)` of each junction removed. */
function trimmed(points: Ring, cutAt: (i: number) => number) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  }
  const total = cum[cum.length - 1]!;
  const cuts: [number, number][] = [];
  for (let i = 0; i < points.length; i += 1) {
    const r = cutAt(i);
    if (r > 0) cuts.push([cum[i]! - r, cum[i]! + r]);
  }
  cuts.sort((a, b) => a[0] - b[0]);
  const keep: [number, number][] = [];
  let at = 0;
  for (const [a, b] of cuts) {
    if (a > at) keep.push([at, Math.min(a, total)]);
    at = Math.max(at, b);
  }
  if (at < total) keep.push([at, total]);
  const pointAt = (s: number): [number, number] => {
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i += 1;
    const span = cum[i]! - cum[i - 1]! || 1;
    const t = Math.min(1, Math.max(0, (s - cum[i - 1]!) / span));
    const p = points[i - 1]!;
    const q = points[i]!;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  return keep
    .filter(([a, b]) => b - a > 0.3)
    .map(([a, b]) => {
      const piece: [number, number][] = [pointAt(a)];
      for (let i = 0; i < points.length; i += 1) if (cum[i]! > a && cum[i]! < b) piece.push([points[i]![0], points[i]![1]]);
      piece.push(pointAt(b));
      return { piece, length: b - a };
    });
}

/** Points every `step` along a polyline, with the local direction. */
function walk(piece: readonly (readonly [number, number])[], step: number, start: number) {
  const out: { x: number; z: number; dx: number; dz: number }[] = [];
  let carry = start;
  for (let i = 0; i < piece.length - 1; i += 1) {
    const [ax, az] = piece[i]!;
    const [bx, bz] = piece[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-5) continue;
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    let s = carry;
    while (s < len) {
      out.push({ x: ax + dx * s, z: az + dz * s, dx, dz });
      s += step;
    }
    carry = s - len;
  }
  return out;
}

/** Road segments on a coarse grid, for "is this spot on a street". */
class RoadGrid {
  private cells = new Map<number, number[]>();
  private segs: number[] = [];
  constructor(private cell = 3) {}
  private k(cx: number, cz: number) {
    return cx * 1_000_003 + cz;
  }
  add(ax: number, az: number, bx: number, bz: number, half: number) {
    const id = this.segs.length / 5;
    this.segs.push(ax, az, bx, bz, half);
    const pad = half + 1;
    for (let cx = Math.floor((Math.min(ax, bx) - pad) / this.cell); cx <= Math.floor((Math.max(ax, bx) + pad) / this.cell); cx += 1) {
      for (let cz = Math.floor((Math.min(az, bz) - pad) / this.cell); cz <= Math.floor((Math.max(az, bz) + pad) / this.cell); cz += 1) {
        const list = this.cells.get(this.k(cx, cz));
        if (list) list.push(id);
        else this.cells.set(this.k(cx, cz), [id]);
      }
    }
  }
  /** True when (x, z) is within a road's half width plus `margin`. */
  near(x: number, z: number, margin: number) {
    const list = this.cells.get(this.k(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!list) return false;
    for (const id of list) {
      const [ax, az, bx, bz, half] = this.segs.slice(id * 5, id * 5 + 5) as [number, number, number, number, number];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < half + margin) return true;
    }
    return false;
  }
}

type Spot = { x: number; z: number; s: number; color: string };

function buildStreets(parsed: Parsed, treeColors: readonly string[]) {
  const roads = parsed.ways.filter((w) => w.layer === "road" && !w.bridge && !w.indoor && w.points.length >= 2);
  // Arms meeting at each node: a way ending there adds one, passing through adds two.
  const arms = new Map<string, number>();
  const widest = new Map<string, number>();
  for (const way of roads) {
    way.points.forEach((p, i) => {
      const k = key(p);
      const end = i === 0 || i === way.points.length - 1;
      arms.set(k, (arms.get(k) ?? 0) + (end ? 1 : 2));
      widest.set(k, Math.max(widest.get(k) ?? 0, way.halfWidth));
    });
  }
  const junction = (p: readonly [number, number]) => (arms.get(key(p)) ?? 0) >= 3;

  const grid = new RoadGrid();
  for (const way of roads) {
    for (let i = 0; i < way.points.length - 1; i += 1) {
      const [ax, az] = way.points[i]!;
      const [bx, bz] = way.points[i + 1]!;
      grid.add(ax, az, bx, bz, way.halfWidth);
    }
  }
  const footprints = new FootprintGrid(parsed.buildings.map((b) => b.ring));
  const water = new FootprintGrid(parsed.water.map((b) => b.ring), 8);

  const paint = new Paint();
  const Y_LINE = 0.066;
  const Y_CURB = 0.071;
  const trees: Spot[] = [];
  let stripes = 0;

  for (const way of roads) {
    const hw = way.halfWidth;
    const kind = way.highway ?? "";
    const service = kind === "service" || kind === "track" || kind === "pedestrian";
    const major = MAJOR.has(kind);
    const minor = MINOR.has(kind);
    const pieces = trimmed(way.points, (i) => (junction(way.points[i]!) ? (widest.get(key(way.points[i]!)) ?? hw) + 0.12 : 0));

    for (const { piece } of pieces) {
      // Curbs: a pale edge on both sides of every street.
      if (!service) {
        for (let i = 0; i < piece.length - 1; i += 1) {
          paint.bar(piece[i]!, piece[i + 1]!, hw + 0.03, 0.035, Y_CURB, CURB);
          paint.bar(piece[i]!, piece[i + 1]!, -(hw + 0.03), 0.035, Y_CURB, CURB);
        }
      }
      if (service || hw < 0.2) continue;
      const lanes = Math.max(1, way.lanes ?? Math.round((hw * 2) / 0.46));
      // Centre line: double yellow on big roads, dashed yellow on smaller two-way streets.
      if (way.oneway === 0 && lanes >= 2) {
        if (major || lanes >= 4) {
          for (let i = 0; i < piece.length - 1; i += 1) {
            paint.bar(piece[i]!, piece[i + 1]!, 0.028, 0.012, Y_LINE, YELLOW);
            paint.bar(piece[i]!, piece[i + 1]!, -0.028, 0.012, Y_LINE, YELLOW);
          }
        } else if (minor) {
          for (const d of walk(piece, 0.7, 0.15)) {
            paint.bar([d.x, d.z], [d.x + d.dx * 0.32, d.z + d.dz * 0.32], 0, 0.014, Y_LINE, YELLOW);
          }
        }
      }
      // Lane dashes between lanes going the same way.
      const lane = (hw * 2) / lanes;
      const offsets: number[] = [];
      if (way.oneway === 0) {
        const perSide = Math.floor(lanes / 2);
        for (let k = 1; k < perSide; k += 1) offsets.push(k * lane, -k * lane);
      } else {
        for (let k = 1; k < lanes; k += 1) offsets.push(-hw + k * lane);
      }
      if (offsets.length) {
        for (const d of walk(piece, 0.8, 0.2)) {
          for (const o of offsets) paint.bar([d.x, d.z], [d.x + d.dx * 0.36, d.z + d.dz * 0.36], o, 0.013, Y_LINE, WHITE);
        }
      }
      // Edge lines on the big roads.
      if (major) {
        for (let i = 0; i < piece.length - 1; i += 1) {
          paint.bar(piece[i]!, piece[i + 1]!, hw - 0.05, 0.012, Y_LINE, WHITE);
          paint.bar(piece[i]!, piece[i + 1]!, -(hw - 0.05), 0.012, Y_LINE, WHITE);
        }
      }
    }

    // Crosswalks: zebra stripes across each arm, just back from the junction.
    if (!service && hw >= 0.2 && stripes < 40000) {
      way.points.forEach((p, i) => {
        if (!junction(p)) return;
        const back = (widest.get(key(p)) ?? hw) + 0.08;
        for (const dir of [-1, 1]) {
          const q = way.points[i + dir];
          if (!q) continue;
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (len < back + 0.5) continue;
          const dx = (q[0] - p[0]) / len;
          const dz = (q[1] - p[1]) / len;
          const a: [number, number] = [p[0] + dx * back, p[1] + dz * back];
          const b: [number, number] = [p[0] + dx * (back + 0.32), p[1] + dz * (back + 0.32)];
          for (let o = -hw + 0.07; o <= hw - 0.05; o += 0.13) {
            paint.bar(a, b, o, 0.035, Y_LINE + 0.001, WHITE);
            stripes += 1;
          }
        }
      });
    }

    // Street trees: a row just outside the curb, skipping corners, drives, and buildings.
    if ((minor || major) && trees.length < 2600) {
      const rows = trimmed(way.points, (i) => (junction(way.points[i]!) ? (widest.get(key(way.points[i]!)) ?? hw) + 1.2 : 0));
      for (const { piece } of rows) {
        for (const side of [1, -1]) {
          for (const d of walk(piece, 2.3, 1.1)) {
            const o = side * (hw + 0.9);
            const x = d.x - d.dz * o;
            const z = d.z + d.dx * o;
            const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
            if (h < 0.18) continue;
            if (grid.near(x, z, 0.35)) continue;
            if (footprints.inside(x, z) || footprints.inside(x + 0.4, z) || footprints.inside(x - 0.4, z) || footprints.inside(x, z + 0.4) || footprints.inside(x, z - 0.4)) continue;
            if (water.inside(x, z)) continue;
            trees.push({ x, z, s: 0.5 + h * 0.22, color: treeColors[Math.floor(h * 97) % treeColors.length] ?? "#4b7d40" });
          }
        }
      }
    }
  }
  return { markings: paint.geometry(), trees };
}

/** Small HVAC boxes, water tanks, and stair huts on flat roofs (the up-facing faces of the metal caps). */
function buildRooftops(metal: THREE.BufferGeometry) {
  const pos = metal.getAttribute("position");
  const nor = metal.getAttribute("normal");
  if (!pos || !nor) return null;
  const parts: THREE.BufferGeometry[] = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const tank = new THREE.CylinderGeometry(1, 1, 1, 10);
  for (let t = 0; t + 2 < pos.count && parts.length < 4000; t += 3) {
    if (nor.getY(t) < 0.99) continue;
    const y = pos.getY(t);
    if (y < 1.6) continue;
    const ax = pos.getX(t), az = pos.getZ(t);
    const bx = pos.getX(t + 1), bz = pos.getZ(t + 1);
    const cx = pos.getX(t + 2), cz = pos.getZ(t + 2);
    const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
    const perim = Math.hypot(bx - ax, bz - az) + Math.hypot(cx - bx, cz - bz) + Math.hypot(ax - cx, az - cz);
    const inradius = (2 * area) / (perim || 1);
    if (inradius < 0.32) continue;
    const count = Math.min(4, Math.max(1, Math.floor(area / 2.5)));
    for (let k = 0; k < count; k += 1) {
      const h1 = Math.abs(Math.sin((ax + k * 3.1) * 12.9898 + (az + y) * 78.233) * 43758.5453) % 1;
      const h2 = Math.abs(Math.sin((bx + k * 1.7) * 39.346 + (bz - y) * 11.135) * 43758.5453) % 1;
      if (h1 < 0.2 && count === 1) continue;
      // Barycentric weights kept away from the edges.
      let u = 0.2 + h1 * 0.6;
      let v = 0.2 + h2 * 0.6;
      if (u + v > 0.8) {
        u = 0.8 - u * 0.5;
        v = 0.8 - v * 0.5;
      }
      const w = 1 - u - v;
      const x = ax * w + bx * u + cx * v;
      const z = az * w + bz * u + cz * v;
      const size = Math.min(inradius * 0.7, 0.45);
      const turn = h2 * Math.PI;
      const kind = (h1 * 7.31) % 1;
      if (kind < 0.22) {
        // Water tank on a little stand.
        const r = size * 0.42;
        parts.push(tank.clone().scale(r, r * 2.1, r).translate(x, y + r * 1.05 + 0.08, z));
        parts.push(unitBox.clone().scale(r * 1.6, 0.08, r * 1.6).translate(x, y + 0.04, z));
      } else if (kind < 0.35 && inradius > 0.6) {
        // Stair or elevator hut.
        parts.push(unitBox.clone().scale(size * 1.3, 0.42, size).rotateY(turn).translate(x, y + 0.21, z));
      } else {
        // HVAC unit.
        parts.push(unitBox.clone().scale(size * 0.9, 0.16, size * 0.6).rotateY(turn).translate(x, y + 0.08, z));
      }
    }
  }
  unitBox.dispose();
  tank.dispose();
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

function sunDirection() {
  const [x, y, z] = LOOK.sun?.position ?? [40, 52, 18];
  return new THREE.Vector3(x, y, z).normalize();
}

/** Tall towers cast as if this high, so downtown streets are not all in shade. */
const SHADOW_CAST_MAX = 9;

/** Each building triangle flattened onto the ground along the sun. */
function shadowTriangles(parts: readonly THREE.BufferGeometry[]) {
  const sun = sunDirection();
  const kx = sun.x / sun.y;
  const kz = sun.z / sun.y;
  let total = 0;
  for (const g of parts) {
    const pos = g.getAttribute("position");
    if (!pos) continue;
    const count = g.getIndex()?.count ?? pos.count;
    total += count - (count % 3);
  }
  const out = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    const pos = g.getAttribute("position");
    if (!pos) continue;
    const index = g.getIndex();
    const count = index ? index.count : pos.count;
    for (let t = 0; t + 2 < count; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        const i = index ? index.getX(t + k) : t + k;
        const y = Math.min(SHADOW_CAST_MAX, Math.max(0, pos.getY(i)));
        out[o++] = pos.getX(i) - kx * y;
        out[o++] = 0;
        out[o++] = pos.getZ(i) - kz * y;
      }
    }
  }
  return out;
}

/** Most texels the mask may use across the city. */
const SHADOW_TEXELS = 2048;

/**
 * Paint the shadow mask once: buildings swept along the sun, plus a
 * stretched disc under every tree, drawn top-down in white on black.
 * Overlaps are simply white again, so shadows never stack.
 */
function bakeShadows(
  gl: THREE.WebGLRenderer,
  parts: readonly THREE.BufferGeometry[],
  trees: readonly { x: number; z: number; s?: number }[],
) {
  const sun = sunDirection();
  const tris = shadowTriangles(parts);
  if (!tris.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < tris.length; i += 3) {
    minX = Math.min(minX, tris[i]!);
    maxX = Math.max(maxX, tris[i]!);
    minZ = Math.min(minZ, tris[i + 2]!);
    maxZ = Math.max(maxZ, tris[i + 2]!);
  }
  const pad = 4;
  minX -= pad;
  minZ -= pad;
  maxX += pad;
  maxZ += pad;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const scale = SHADOW_TEXELS / Math.max(w, d);
  const target = new THREE.WebGLRenderTarget(Math.max(1, Math.ceil(w * scale)), Math.max(1, Math.ceil(d * scale)), {
    depthBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  const scene = new THREE.Scene();
  const white = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, toneMapped: false });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(tris, 3));
  const sweep = new THREE.Mesh(geometry, white);
  sweep.frustumCulled = false;
  scene.add(sweep);
  // Trees: a disc a little smaller than the crown, pushed away from the sun.
  const flat = Math.hypot(sun.x, sun.z) || 1;
  const run = flat / sun.y;
  const disc = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
  const crowns = new THREE.InstancedMesh(disc, white, Math.max(1, trees.length));
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-sun.z, sun.x));
  const m = new THREE.Matrix4();
  trees.forEach((tree, i) => {
    const s = tree.s ?? 1;
    const reach = 1.15 * s * run;
    m.compose(
      new THREE.Vector3(tree.x - (sun.x / flat) * reach, 0, tree.z - (sun.z / flat) * reach),
      q,
      new THREE.Vector3(0.58 * s * Math.min(2.6, 1 + run * 0.4), 1, 0.58 * s),
    );
    crowns.setMatrixAt(i, m);
  });
  crowns.count = trees.length;
  crowns.frustumCulled = false;
  scene.add(crowns);
  // Looking straight down; top and bottom are swapped so v grows with z.
  const camera = new THREE.OrthographicCamera(minX, maxX, -maxZ, -minZ, -10, 10);
  camera.position.set(0, 1, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const before = gl.getRenderTarget();
  const clear = gl.getClearColor(new THREE.Color());
  const alpha = gl.getClearAlpha();
  gl.setRenderTarget(target);
  gl.setClearColor("#000000", 1);
  gl.clear(true, false, false);
  gl.render(scene, camera);
  gl.setRenderTarget(before);
  gl.setClearColor(clear, alpha);

  geometry.dispose();
  disc.dispose();
  crowns.dispose();
  white.dispose();
  return { target, box: new THREE.Vector4(minX, minZ, 1 / w, 1 / d) };
}

function InstancedTrees({ items, trunk, canopy, bark, leaves }: { items: Spot[]; trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry; bark: THREE.Material; leaves: THREE.Material }) {
  const meshes = useMemo(() => {
    const n = Math.max(1, items.length);
    const t = new THREE.InstancedMesh(trunk, bark, n);
    const c = new THREE.InstancedMesh(canopy, leaves, n);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    items.forEach((item, i) => {
      m.makeScale(item.s, item.s, item.s).setPosition(item.x, 0, item.z);
      t.setMatrixAt(i, m);
      c.setMatrixAt(i, m);
      c.setColorAt(i, color.set(item.color));
    });
    for (const mesh of [t, c]) {
      mesh.count = items.length;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.raycast = () => null;
      mesh.computeBoundingSphere();
    }
    return [t, c] as const;
  }, [items, trunk, canopy, bark, leaves]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  return (
    <>
      <primitive object={meshes[0]} />
      <primitive object={meshes[1]} />
    </>
  );
}

const DEFAULT_GREENS = ["#3f6f3a", "#4b7d40", "#5a8c48", "#6a9a50"] as const;

/** The parts of the built city the looks read (one object per city build). */
type BuiltLike = {
  glass: readonly THREE.BufferGeometry[];
  siding: readonly THREE.BufferGeometry[];
  shingles: readonly THREE.BufferGeometry[];
  masonry: readonly { geometry: THREE.BufferGeometry }[];
  stone: THREE.BufferGeometry;
  metal: THREE.BufferGeometry;
  trees: readonly { x: number; z: number; s?: number }[];
};

type DetailProps = {
  parsed: Parsed;
  built: BuiltLike;
  tree: { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry; bark: THREE.Material; leaves: THREE.Material };
  reducedMotion: boolean;
};

/**
 * Everything this look adds to the scene: exposure, water ripples, and the
 * extra street and rooftop meshes. Nothing at all for today's look.
 */
export function LookDetails(props: DetailProps) {
  return LOOK.id === "today" ? null : <LookLayer {...props} />;
}

function LookLayer({ parsed, built, tree, reducedMotion }: DetailProps) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (LOOK.exposure === undefined) return;
    const before = gl.toneMappingExposure;
    gl.toneMappingExposure = LOOK.exposure;
    return () => {
      gl.toneMappingExposure = before;
    };
  }, [gl]);
  useFrame((_, delta) => {
    if (LOOK.shimmer && !reducedMotion) shimmerTime.value += delta;
  });

  const streets = useMemo(
    () => (LOOK.streets ? buildStreets(parsed, LOOK.trees?.green ?? DEFAULT_GREENS) : null),
    [parsed],
  );
  const roofs = useMemo(() => (LOOK.rooftops ? buildRooftops(built.metal) : null), [built]);
  useEffect(() => {
    if (!LOOK.sunShadows) return;
    const baked = bakeShadows(
      gl,
      [...built.glass, ...built.siding, ...built.shingles, ...built.masonry.map((m) => m.geometry), built.stone, built.metal],
      built.trees,
    );
    if (!baked) return;
    const empty = shadowMask.uLookShadow.value;
    shadowMask.uLookShadow.value = baked.target.texture;
    shadowMask.uLookShadowBox.value.copy(baked.box);
    return () => {
      shadowMask.uLookShadow.value = empty;
      baked.target.dispose();
    };
  }, [gl, built]);
  const looks = useMemo(
    () => ({
      markings: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      roof: new THREE.MeshStandardMaterial({ color: "#a2abb1", roughness: 0.7, metalness: 0.2 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(looks).forEach((m) => m.dispose()), [looks]);
  useEffect(() => () => streets?.markings.dispose(), [streets]);
  useEffect(() => () => roofs?.dispose(), [roofs]);
  // Street trees are small: a 20-triangle crown keeps a full row cheap.
  const smallCrown = useMemo(() => new THREE.IcosahedronGeometry(0.62, 0).scale(1, 1.15, 1).translate(0, 1.15, 0), []);
  useEffect(() => () => smallCrown.dispose(), [smallCrown]);

  return (
    <group name={`look-${LOOK.id}`}>
      {streets ? (
        <>
          <mesh geometry={streets.markings} material={looks.markings} receiveShadow raycast={() => null} />
          <InstancedTrees items={streets.trees} {...tree} canopy={smallCrown} />
        </>
      ) : null}
      {roofs ? <mesh geometry={roofs} material={looks.roof} castShadow receiveShadow raycast={() => null} /> : null}
    </group>
  );
}
