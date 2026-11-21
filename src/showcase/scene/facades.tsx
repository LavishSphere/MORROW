import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Surface } from "../materials";

export type DetailedBuildingProps = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
};

const GLASS = "#124850";
const GLASS_GLOW = "#0c3338";
const GLASS_ROUGHNESS = 0.15;
const GLASS_METALNESS = 0.6;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 16;
const CELL = 64;
const FLOOR = 3.05;
const BAY = 1.42;

type FacadeTextures = {
  albedo: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
};

function hash(n: number): number {
  let value = n | 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function shadeHex(hex: string, amount: number): string {
  const raw = hex.trim().replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((channel) => channel + channel).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
  const packed = parseInt(full, 16);
  const channels = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255].map((channel) =>
    Math.max(0, Math.min(255, channel + amount)),
  );
  return `#${((channels[0] << 16) | (channels[1] << 8) | channels[2]).toString(16).padStart(6, "0")}`;
}

function makeFacadeTexture(canvas: HTMLCanvasElement, across: number, up: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.repeat.set(across / ATLAS_COLS, up / ATLAS_ROWS);
  texture.needsUpdate = true;
  return texture;
}

function createWindowCanvases(wall: string, seed: number): { albedo: HTMLCanvasElement; emissive: HTMLCanvasElement } {
  const albedo = document.createElement("canvas");
  const emissive = document.createElement("canvas");
  albedo.width = ATLAS_COLS * CELL;
  albedo.height = ATLAS_ROWS * CELL;
  emissive.width = albedo.width;
  emissive.height = albedo.height;
  const wallPaint = albedo.getContext("2d");
  const glowPaint = emissive.getContext("2d");
  if (!wallPaint || !glowPaint) return { albedo, emissive };

  wallPaint.fillStyle = wall;
  wallPaint.fillRect(0, 0, albedo.width, albedo.height);
  const panel = shadeHex(wall, -10);
  for (let speck = 0; speck < 520; speck += 1) {
    const px = hash(seed + speck * 19) % albedo.width;
    const py = hash(seed + speck * 47) % albedo.height;
    wallPaint.fillStyle = speck % 3 === 0 ? panel : shadeHex(wall, 8);
    wallPaint.fillRect(px, py, 2, 2);
  }
  wallPaint.fillStyle = shadeHex(wall, -18);
  for (let col = 1; col < ATLAS_COLS; col += 1) wallPaint.fillRect(col * CELL - 1, 0, 2, albedo.height);
  for (let row = 1; row < ATLAS_ROWS; row += 1) wallPaint.fillRect(0, row * CELL - 1, albedo.width, 2);

  glowPaint.fillStyle = "#000000";
  glowPaint.fillRect(0, 0, emissive.width, emissive.height);

  for (let row = 0; row < ATLAS_ROWS; row += 1) {
    for (let col = 0; col < ATLAS_COLS; col += 1) {
      const x0 = col * CELL + 14;
      const y0 = row * CELL + 8;
      const ww = CELL - 28;
      const wh = CELL - 22;
      const pick = hash(seed + row * 131 + col * 17) % 24;
      const bright = pick < 4;
      const dim = !bright && pick < 7;
      const sky = !bright && !dim && pick < 10;
      wallPaint.fillStyle = "#1b222a";
      wallPaint.fillRect(x0 - 2, y0 - 2, ww + 4, wh + 4);
      wallPaint.fillStyle = bright ? "#f2d3a4" : dim ? "#e2b06a" : sky ? "#d4e1ec" : "#141c28";
      wallPaint.fillRect(x0, y0, ww, wh);
      wallPaint.fillStyle = "#12171c";
      wallPaint.fillRect(x0 + Math.floor(ww / 2) - 1, y0, 2, wh);
      wallPaint.fillRect(x0, y0 + Math.floor(wh / 2) - 1, ww, 2);
      wallPaint.fillStyle = "rgba(255,255,255,0.38)";
      wallPaint.fillRect(x0 - 2, y0 + wh, ww + 4, 2);
      if (bright && hash(seed + row * 3 + col) % 4 === 0) {
        wallPaint.fillStyle = "rgba(255,236,214,0.5)";
        wallPaint.fillRect(x0 + 2, y0 + 2, Math.floor(ww * 0.32), wh - 4);
      }
      if (bright || dim) {
        glowPaint.fillStyle = bright ? "#ffd8a8" : "#c9853e";
        glowPaint.fillRect(x0, y0, ww, wh);
      }
    }
  }

  return { albedo, emissive };
}

function disposeMaps(maps: FacadeTextures) {
  maps.albedo.dispose();
  maps.emissive.dispose();
}

function spread(values: number[], count: number): number[] {
  if (count <= 0 || values.length === 0) return [];
  if (count === 1 || values.length === 1) return [values[Math.floor(values.length / 2)]];
  const picked: number[] = [];
  const used = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const slot = Math.round((index * (values.length - 1)) / (count - 1));
    const value = values[Math.min(values.length - 1, slot)];
    if (used.has(value)) continue;
    used.add(value);
    picked.push(value);
  }
  return picked;
}

function WindowSkin({
  width,
  depth,
  height,
  centerY,
  front,
  side,
}: {
  width: number;
  depth: number;
  height: number;
  centerY: number;
  front: FacadeTextures;
  side: FacadeTextures;
}) {
  const skin = 0.04;
  const proud = 0.012;
  const faces: Array<{ key: string; position: [number, number, number]; args: [number, number, number]; maps: FacadeTextures }> = [
    { key: "pz", position: [0, centerY, depth / 2 + proud], args: [width, height, skin], maps: front },
    { key: "nz", position: [0, centerY, -depth / 2 - proud], args: [width, height, skin], maps: front },
    { key: "px", position: [width / 2 + proud, centerY, 0], args: [skin, height, depth], maps: side },
    { key: "nx", position: [-width / 2 - proud, centerY, 0], args: [skin, height, depth], maps: side },
  ];
  return (
    <group>
      {faces.map((face) => (
        <mesh key={face.key} position={face.position} receiveShadow>
          <boxGeometry args={face.args} />
          <meshStandardMaterial
            color="#ffffff"
            map={face.maps.albedo}
            emissive="#ffffff"
            emissiveMap={face.maps.emissive}
            emissiveIntensity={0.46}
            roughness={0.86}
            metalness={0.04}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
    </group>
  );
}

function CornerPiers({
  width,
  depth,
  height,
  base,
  color,
}: {
  width: number;
  depth: number;
  height: number;
  base: number;
  color: string;
}) {
  const pier = 0.34;
  const corners: Array<[number, number]> = [
    [width / 2, depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [-width / 2, -depth / 2],
  ];
  return (
    <group>
      {corners.map(([cx, cz]) => (
        <mesh key={`${cx}:${cz}`} position={[cx, base + height / 2, cz]} castShadow receiveShadow>
          <boxGeometry args={[pier, height, pier]} />
          <Surface color={color} roughness={0.78} metalness={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function GlassCurtain({
  width,
  depth,
  centerY,
  bandH,
}: {
  width: number;
  depth: number;
  centerY: number;
  bandH: number;
}) {
  const reveal = 0.24;
  const spanW = Math.max(0.4, width - reveal * 2);
  const spanD = Math.max(0.4, depth - reveal * 2);
  const glassT = 0.06;
  const faces: Array<{
    key: string;
    position: [number, number, number];
    args: [number, number, number];
    axis: "x" | "z";
    span: number;
    frame: [number, number, number];
    frameOut: [number, number, number];
  }> = [
    {
      key: "pz",
      position: [0, centerY, depth / 2 + 0.08],
      args: [spanW, bandH, glassT],
      axis: "x",
      span: spanW,
      frame: [spanW, 0.05, 0.09],
      frameOut: [0, 0, depth / 2 + 0.1],
    },
    {
      key: "nz",
      position: [0, centerY, -depth / 2 - 0.08],
      args: [spanW, bandH, glassT],
      axis: "x",
      span: spanW,
      frame: [spanW, 0.05, 0.09],
      frameOut: [0, 0, -depth / 2 - 0.1],
    },
    {
      key: "px",
      position: [width / 2 + 0.08, centerY, 0],
      args: [glassT, bandH, spanD],
      axis: "z",
      span: spanD,
      frame: [0.09, 0.05, spanD],
      frameOut: [width / 2 + 0.1, 0, 0],
    },
    {
      key: "nx",
      position: [-width / 2 - 0.08, centerY, 0],
      args: [glassT, bandH, spanD],
      axis: "z",
      span: spanD,
      frame: [0.09, 0.05, spanD],
      frameOut: [-width / 2 - 0.1, 0, 0],
    },
  ];

  return (
    <group>
      {faces.map((face) => {
        const mullionCount = Math.max(2, Math.round(face.span / 1.45));
        const step = face.span / mullionCount;
        return (
          <group key={face.key}>
            <mesh position={face.position} castShadow receiveShadow>
              <boxGeometry args={face.args} />
              <Surface
                color={GLASS}
                roughness={GLASS_ROUGHNESS}
                metalness={GLASS_METALNESS}
                emissive={GLASS_GLOW}
                emissiveIntensity={0.18}
              />
            </mesh>
            {[-1, 1].map((edge) => (
              <mesh
                key={edge}
                position={[
                  face.frameOut[0],
                  centerY + edge * (bandH / 2 - 0.01),
                  face.frameOut[2],
                ]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={face.frame} />
                <Surface color="#242a30" roughness={0.35} metalness={0.68} />
              </mesh>
            ))}
            {Array.from({ length: mullionCount }, (_, index) => {
              const offset = -face.span / 2 + step * (index + 0.5);
              const position: [number, number, number] =
                face.axis === "x"
                  ? [offset, centerY, face.frameOut[2]]
                  : [face.frameOut[0], centerY, offset];
              return (
                <mesh key={index} position={position} castShadow>
                  <boxGeometry args={[0.045, bandH * 0.92, 0.045]} />
                  <Surface color="#242a30" roughness={0.35} metalness={0.68} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function Balcony({ width, railH }: { width: number; railH: number }) {
  const depth = 0.76;
  const postCount = Math.max(3, Math.round(width / 0.46));
  const posts = Array.from({ length: postCount }, (_, index) => -width / 2 + (width * index) / (postCount - 1));
  return (
    <group>
      <mesh position={[0, 0.045, depth / 2 - 0.06]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.07, depth]} />
        <Surface color="#a8aeb3" roughness={0.6} metalness={0.24} />
      </mesh>
      {posts.map((px, index) => (
        <mesh key={index} position={[px, 0.08 + railH / 2, depth - 0.08]} castShadow>
          <boxGeometry args={[0.04, railH, 0.04]} />
          <Surface color="#2b3136" roughness={0.34} metalness={0.72} />
        </mesh>
      ))}
      <mesh position={[0, 0.08 + railH, depth - 0.08]} castShadow>
        <boxGeometry args={[width, 0.035, 0.04]} />
        <Surface color="#2b3136" roughness={0.34} metalness={0.72} />
      </mesh>
      <mesh position={[0, 0.08 + railH * 0.46, depth - 0.08]} castShadow>
        <boxGeometry args={[width - 0.1, 0.028, 0.03]} />
        <Surface color="#2b3136" roughness={0.34} metalness={0.72} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2), 0.08 + railH, depth / 2 - 0.05]} castShadow>
          <boxGeometry args={[0.04, 0.035, depth - 0.1]} />
          <Surface color="#2b3136" roughness={0.34} metalness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function Entry({
  width,
  podiumH,
  faceZ,
  trim,
}: {
  width: number;
  podiumH: number;
  faceZ: number;
  trim: string;
}) {
  const lobbyW = Math.min(4.8, Math.max(1.8, width * 0.44));
  const base = 0.4;
  const corniceClear = podiumH - 0.38;
  const lobbyH = Math.min(2.15, Math.max(0.95, corniceClear - base - 0.24));
  const top = base + lobbyH;
  const canopyY = Math.min(top + 0.24, corniceClear);
  const cols = lobbyW > 3.6 ? 4 : 3;
  const paneRows = 2;
  const gap = 0.07;
  const paneW = (lobbyW - gap * (cols - 1)) / cols;
  const paneH = (lobbyH - gap * (paneRows - 1)) / paneRows;
  const panes: Array<{ key: string; x: number; y: number; door: boolean }> = [];
  for (let row = 0; row < paneRows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      panes.push({
        key: `${col}-${row}`,
        x: -lobbyW / 2 + paneW / 2 + col * (paneW + gap),
        y: base + paneH / 2 + row * (paneH + gap),
        door: row === 0 && col === Math.floor(cols / 2),
      });
    }
  }

  return (
    <group>
      <mesh position={[0, base + lobbyH / 2, faceZ + 0.05]} castShadow receiveShadow>
        <boxGeometry args={[lobbyW + 0.1, lobbyH + 0.1, 0.08]} />
        <Surface color="#161b20" roughness={0.64} metalness={0.16} />
      </mesh>
      {panes.map((pane) => (
        <mesh key={pane.key} position={[pane.x, pane.y, faceZ + 0.1]} castShadow receiveShadow>
          <boxGeometry args={[paneW, paneH, 0.045]} />
          <Surface
            color={GLASS}
            roughness={GLASS_ROUGHNESS}
            metalness={GLASS_METALNESS}
            emissive={pane.door ? "#0c3338" : "#b18448"}
            emissiveIntensity={pane.door ? 0.1 : 0.28}
          />
        </mesh>
      ))}
      {panes
        .filter((pane) => pane.door)
        .map((pane) => (
          <mesh key="handle" position={[pane.x + paneW * 0.28, base + paneH * 0.48, faceZ + 0.14]} castShadow>
            <boxGeometry args={[0.08, 0.035, 0.04]} />
            <Surface color="#e7edf1" roughness={0.28} metalness={0.82} />
          </mesh>
        ))}
      {canopyY - top > 0.16 && (
        <mesh position={[0, (top + canopyY) / 2, faceZ + 0.09]} castShadow receiveShadow>
          <boxGeometry args={[lobbyW + 0.16, 0.1, 0.05]} />
          <Surface color="#23282e" roughness={0.42} metalness={0.52} emissive="#d7c4a4" emissiveIntensity={0.14} />
        </mesh>
      )}
      <mesh position={[0, canopyY, faceZ + 0.58]} castShadow receiveShadow>
        <boxGeometry args={[lobbyW + 0.6, 0.1, 1.15]} />
        <Surface color={trim} roughness={0.62} metalness={0.16} />
      </mesh>
      <mesh position={[0, canopyY - 0.07, faceZ + 0.5]}>
        <boxGeometry args={[lobbyW * 0.72, 0.02, 0.08]} />
        <Surface color="#f4efe4" roughness={0.42} metalness={0} emissive="#f4efe4" emissiveIntensity={0.65} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (lobbyW / 2 + 0.14), canopyY / 2, faceZ + 0.36]} castShadow receiveShadow>
          <boxGeometry args={[0.16, canopyY, 0.22]} />
          <Surface color={trim} roughness={0.72} metalness={0.12} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, faceZ + 0.4]} castShadow receiveShadow>
        <boxGeometry args={[lobbyW * 0.68, 0.12, 0.5]} />
        <Surface color={trim} roughness={0.84} metalness={0.05} />
      </mesh>
    </group>
  );
}

function Parapet({
  width,
  depth,
  base,
  color,
}: {
  width: number;
  depth: number;
  base: number;
  color: string;
}) {
  const tall = 0.72;
  const thick = 0.14;
  const y = base + tall / 2;
  const walls: Array<{ key: string; position: [number, number, number]; args: [number, number, number] }> = [
    { key: "n", position: [0, y, depth / 2 - thick / 2], args: [width, tall, thick] },
    { key: "s", position: [0, y, -depth / 2 + thick / 2], args: [width, tall, thick] },
    { key: "e", position: [width / 2 - thick / 2, y, 0], args: [thick, tall, depth] },
    { key: "w", position: [-width / 2 + thick / 2, y, 0], args: [thick, tall, depth] },
  ];
  return (
    <group>
      {walls.map((wall) => (
        <mesh key={wall.key} position={wall.position} castShadow receiveShadow>
          <boxGeometry args={wall.args} />
          <Surface color={color} roughness={0.74} metalness={0.12} />
        </mesh>
      ))}
    </group>
  );
}

function RoofGear({
  height,
  towerW,
  towerD,
  color,
  flip,
}: {
  height: number;
  towerW: number;
  towerD: number;
  color: string;
  flip: number;
}) {
  if (!(height > 16)) return null;
  const deck = height + 0.08;
  const margin = 0.28;
  const pentH = Math.min(2.3, Math.max(1.45, height * 0.055));
  const pentW = Math.min(towerW * 0.4, Math.max(1.15, towerW * 0.5 - 0.55));
  const pentD = Math.min(towerD * 0.38, Math.max(1.15, towerD * 0.5 - 0.55));
  const pentX = flip * (towerW / 2 - margin - pentW / 2);
  const pentZ = -flip * (towerD / 2 - margin - pentD / 2);
  const acRadius = 0.32;
  const acX = -flip * (towerW / 2 - margin - acRadius - 0.08);
  const acZ = flip * (towerD / 2 - margin - acRadius - 0.08);
  const housing = shadeHex(color, -18);
  const inwardX = pentX - flip * (pentW / 2 + 0.01);

  return (
    <group>
      <mesh position={[pentX, deck + pentH / 2, pentZ]} castShadow receiveShadow>
        <boxGeometry args={[pentW, pentH, pentD]} />
        <Surface color={housing} roughness={0.74} metalness={0.1} />
      </mesh>
      <mesh position={[pentX, deck + pentH * 0.55, pentZ + flip * (pentD / 2 + 0.01)]} castShadow>
        <boxGeometry args={[pentW * 0.28, pentH * 0.42, 0.04]} />
        <Surface color="#12161a" roughness={0.6} metalness={0.12} />
      </mesh>
      {Array.from({ length: 4 }, (_, index) => (
        <mesh key={index} position={[inwardX, deck + 0.28 + index * (pentH * 0.18), pentZ]} castShadow>
          <boxGeometry args={[0.05, 0.055, pentD * 0.7]} />
          <Surface color="#2a3036" roughness={0.4} metalness={0.48} />
        </mesh>
      ))}
      <mesh position={[pentX, deck + pentH + 0.85, pentZ]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 1.7, 16]} />
        <Surface color="#23282d" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[pentX, deck + pentH + 1.72, pentZ]} castShadow>
        <sphereGeometry args={[0.055, 16, 16]} />
        <Surface color="#d5dbe0" roughness={0.32} metalness={0.64} />
      </mesh>
      <mesh position={[acX, deck + 0.52, acZ]} castShadow receiveShadow>
        <cylinderGeometry args={[acRadius, acRadius, 1, 24]} />
        <Surface color="#6a727a" roughness={0.42} metalness={0.52} />
      </mesh>
      <mesh position={[acX, deck + 1.05, acZ]} castShadow receiveShadow>
        <cylinderGeometry args={[acRadius + 0.04, acRadius + 0.04, 0.06, 24]} />
        <Surface color="#4e555c" roughness={0.38} metalness={0.6} />
      </mesh>
      {towerW > 5.4 && towerD > 4.8 && (
        <mesh position={[acX, deck + 0.4, acZ - flip * 0.95]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.9, 24]} />
          <Surface color="#8d949a" roughness={0.4} metalness={0.58} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Grounded mid/high-rise: podium, set-back tower, glass belt, slab edges, balconies.
 * The footprint is centered on (x, z) and the base sits on y = 0.
 */
export function DetailedBuilding({ x, z, w, d, h, color }: DetailedBuildingProps) {
  const width = Math.max(w, 1.8);
  const depth = Math.max(d, 1.8);
  const height = Math.max(h, 3);
  const podiumTarget = height >= 20 ? 5.7 : height >= 12 ? 4.05 : 2.65;
  const podiumH = Math.min(podiumTarget, Math.max(1.7, height * 0.42));
  const towerH = height - podiumH;
  const insetX = Math.min(Math.max(0.4, width * 0.11), Math.max(0.2, width * 0.2));
  const insetZ = Math.min(Math.max(0.4, depth * 0.11), Math.max(0.2, depth * 0.2));
  const towerW = Math.max(1.2, width - insetX * 2);
  const towerD = Math.max(1.2, depth - insetZ * 2);
  const towerFloors = Math.max(2, Math.round(towerH / FLOOR));
  const floorH = towerH / towerFloors;
  const podiumFloors = Math.max(1, Math.ceil(podiumH / 2.5));
  const towerBaysW = Math.max(2, Math.round(towerW / BAY));
  const towerBaysD = Math.max(2, Math.round(towerD / BAY));
  const podiumBaysW = Math.max(2, Math.round(width / 1.6));
  const podiumBaysD = Math.max(2, Math.round(depth / 1.6));
  const beltFloor = towerFloors > 3 ? 1 : 0;
  const beltY = podiumH + (beltFloor + 0.5) * floorH;
  const beltH = floorH * 0.66;
  const trim = shadeHex(color, -32);
  const plinth = shadeHex(color, -42);
  const seed = Math.round(x * 10 + z * 17) | 0;

  const painted = useMemo(() => {
    const canvases = createWindowCanvases(color, seed);
    return {
      towerFront: {
        albedo: makeFacadeTexture(canvases.albedo, towerBaysW, towerFloors),
        emissive: makeFacadeTexture(canvases.emissive, towerBaysW, towerFloors),
      },
      towerSide: {
        albedo: makeFacadeTexture(canvases.albedo, towerBaysD, towerFloors),
        emissive: makeFacadeTexture(canvases.emissive, towerBaysD, towerFloors),
      },
      podiumFront: {
        albedo: makeFacadeTexture(canvases.albedo, podiumBaysW, podiumFloors),
        emissive: makeFacadeTexture(canvases.emissive, podiumBaysW, podiumFloors),
      },
      podiumSide: {
        albedo: makeFacadeTexture(canvases.albedo, podiumBaysD, podiumFloors),
        emissive: makeFacadeTexture(canvases.emissive, podiumBaysD, podiumFloors),
      },
    };
  }, [color, seed, towerBaysW, towerFloors, towerBaysD, podiumBaysW, podiumFloors, podiumBaysD]);

  useEffect(() => {
    const maps = painted;
    return () => {
      disposeMaps(maps.towerFront);
      disposeMaps(maps.towerSide);
      disposeMaps(maps.podiumFront);
      disposeMaps(maps.podiumSide);
    };
  }, [painted]);

  const hosts: number[] = [];
  for (let floor = 0; floor < towerFloors; floor += 1) {
    if (floor !== beltFloor) hosts.push(floor);
  }
  const balconyFloors = spread(hosts, hosts.length >= 5 ? 4 : Math.min(3, hosts.length));
  const facings: Array<{
    rotation: number;
    span: number;
    position: (shift: number, y: number) => [number, number, number];
  }> = [
    { rotation: 0, span: towerW, position: (shift, y) => [shift, y, towerD / 2] },
    { rotation: Math.PI / 2, span: towerD, position: (shift, y) => [towerW / 2, y, shift] },
    { rotation: Math.PI, span: towerW, position: (shift, y) => [shift, y, -towerD / 2] },
    { rotation: -Math.PI / 2, span: towerD, position: (shift, y) => [-towerW / 2, y, shift] },
  ];
  const railH = Math.min(0.92, Math.max(0.48, floorH * 0.42));
  const roofFlip = hash(seed + 9) % 2 === 0 ? 1 : -1;

  return (
    <group name="detailed-building" position={[x, 0, z]}>
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.44, 0.28, depth + 0.44]} />
        <Surface color={plinth} roughness={0.92} metalness={0.03} />
      </mesh>
      <mesh position={[0, podiumH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, podiumH, depth]} />
        <Surface color={color} roughness={0.88} metalness={0.03} />
      </mesh>
      <CornerPiers width={width} depth={depth} height={podiumH} base={0} color={trim} />
      <mesh position={[0, podiumH, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.46, 0.26, depth + 0.46]} />
        <Surface color={trim} roughness={0.68} metalness={0.1} />
      </mesh>
      <WindowSkin
        width={width}
        depth={depth}
        height={podiumH}
        centerY={podiumH / 2}
        front={painted.podiumFront}
        side={painted.podiumSide}
      />
      <Entry width={width} podiumH={podiumH} faceZ={depth / 2} trim={trim} />

      <mesh position={[0, podiumH + towerH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[towerW, towerH, towerD]} />
        <Surface color={color} roughness={0.88} metalness={0.03} />
      </mesh>
      <CornerPiers width={towerW} depth={towerD} height={towerH} base={podiumH} color={trim} />
      <WindowSkin
        width={towerW}
        depth={towerD}
        height={towerH}
        centerY={podiumH + towerH / 2}
        front={painted.towerFront}
        side={painted.towerSide}
      />
      <GlassCurtain width={towerW} depth={towerD} centerY={beltY} bandH={beltH} />
      {Array.from({ length: towerFloors - 1 }, (_, index) => (
        <mesh key={index} position={[0, podiumH + (index + 1) * floorH, 0]} castShadow receiveShadow>
          <boxGeometry args={[towerW + 0.36, 0.08, towerD + 0.36]} />
          <Surface color={trim} roughness={0.7} metalness={0.12} />
        </mesh>
      ))}
      {balconyFloors.map((floor, index) => {
        const facing = facings[index % facings.length];
        const balconyW = Math.min(2.15, Math.max(1.05, facing.span * 0.36));
        const room = (facing.span - balconyW) / 2 - 0.22;
        const shift = room > 0.05 ? (index % 2 === 0 ? -1 : 1) * Math.min(facing.span * 0.16, room) : 0;
        const y = podiumH + (floor + 0.34) * floorH;
        return (
          <group key={`${floor}-${index}`} position={facing.position(shift, y)} rotation={[0, facing.rotation, 0]}>
            <Balcony width={balconyW} railH={railH} />
          </group>
        );
      })}

      <mesh position={[0, height, 0]} castShadow receiveShadow>
        <boxGeometry args={[towerW + 0.32, 0.22, towerD + 0.32]} />
        <Surface color={trim} roughness={0.68} metalness={0.12} />
      </mesh>
      <mesh position={[0, height + 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[Math.max(0.6, towerW - 0.32), 0.08, Math.max(0.6, towerD - 0.32)]} />
        <Surface color={shadeHex(color, -26)} roughness={0.9} metalness={0.04} />
      </mesh>
      <Parapet width={towerW} depth={towerD} base={height} color={trim} />
      <RoofGear height={h} towerW={towerW} towerD={towerD} color={color} flip={roofFlip} />
    </group>
  );
}
