import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createGrassTexture } from "../materials";
import { scene } from "../palette";
import { BUILDINGS, CITY_LIMIT, TREES, onPavement } from "./cityData";

const PARK = { minX: -28, maxX: -9, minZ: 9, maxZ: 28 };
const CITY_TUFTS = 20000;
const PARK_TUFTS = 6000;
const BLADE_WIDTH = 0.08;
const BLADE_HEIGHT = 0.22;
const GROUND_SIZE = 560;

const GREENS = [
  "#2a5524",
  "#346830",
  "#3d7634",
  "#4a8638",
  "#568f3c",
  "#629848",
  "#74a84e",
  "#8bb85c",
] as const;

function seedRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function tuftGeometry() {
  const blade = new THREE.PlaneGeometry(BLADE_WIDTH, BLADE_HEIGHT, 1, 4);
  const position = blade.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const t = THREE.MathUtils.clamp((position.getY(i) + BLADE_HEIGHT / 2) / BLADE_HEIGHT, 0, 1);
    const taper = 1 - t * 0.55;
    position.setX(i, position.getX(i) * taper);
    position.setZ(i, t * t * 0.1);
    const shade = 0.86 + t * 0.14;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  position.needsUpdate = true;
  blade.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  blade.translate(0, BLADE_HEIGHT / 2, 0);
  blade.computeVertexNormals();

  const flat = blade.toNonIndexed();
  blade.dispose();
  const crossed = flat.clone();
  crossed.rotateY(Math.PI / 2);
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"] as const) {
    const first = flat.getAttribute(name);
    const second = crossed.getAttribute(name);
    const merged = new Float32Array((first.count + second.count) * first.itemSize);
    merged.set(first.array as Float32Array, 0);
    merged.set(second.array as Float32Array, first.count * first.itemSize);
    geometry.setAttribute(name, new THREE.BufferAttribute(merged, first.itemSize));
  }
  flat.dispose();
  crossed.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}

function insideBuilding(x: number, z: number) {
  return BUILDINGS.some(
    (building) =>
      Math.abs(x - building.x) < building.w / 2 + 0.5 &&
      Math.abs(z - building.z) < building.d / 2 + 0.5,
  );
}

function nearTrunk(x: number, z: number) {
  return TREES.some(([treeX, treeZ]) => {
    const dx = x - treeX;
    const dz = z - treeZ;
    return dx * dx + dz * dz < 0.2;
  });
}

function canGrow(x: number, z: number) {
  return !onPavement(x, z) && !insideBuilding(x, z) && !nearTrunk(x, z);
}

type Blade = {
  x: number;
  z: number;
  yaw: number;
  leanX: number;
  leanZ: number;
  scaleY: number;
  scaleXZ: number;
  color: string;
};

type Region = { minX: number; maxX: number; minZ: number; maxZ: number };

function makeBlade(
  x: number,
  z: number,
  scaleBias: number,
  lush: boolean,
  random: () => number,
): Blade | null {
  const yaw = random() * Math.PI;
  const scaleY = (0.9 + random() * 0.38) * scaleBias;
  const scaleXZ = (0.82 + random() * 0.5) * (lush ? 1.2 : 1);
  const leanX = (random() - 0.5) * 0.1;
  const leanZ = (random() - 0.5) * 0.1;
  const roll = random();
  if (!canGrow(x, z)) return null;
  const start = lush ? 4 : 0;
  const color = GREENS[start + Math.floor(roll * (GREENS.length - start))] ?? scene.grass;
  return { x, z, yaw, leanX, leanZ, scaleY, scaleXZ, color };
}

function takeBudget(blades: Blade[], budget: number, random: () => number) {
  for (let i = blades.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = blades[i];
    blades[i] = blades[j];
    blades[j] = swap;
  }
  blades.length = budget;
  return blades;
}

function scatterRegion(
  region: Region,
  spacing: number,
  budget: number,
  scaleBias: number,
  lush: boolean,
  random: () => number,
) {
  const blades: Blade[] = [];
  for (let x = region.minX; x <= region.maxX; x += spacing) {
    for (let z = region.minZ; z <= region.maxZ; z += spacing) {
      const jx = THREE.MathUtils.clamp(x + (random() - 0.5) * spacing * 0.9, region.minX, region.maxX);
      const jz = THREE.MathUtils.clamp(z + (random() - 0.5) * spacing * 0.9, region.minZ, region.maxZ);
      const blade = makeBlade(jx, jz, scaleBias, lush, random);
      if (blade) blades.push(blade);
    }
  }
  if (blades.length > budget) return takeBudget(blades, budget, random);
  let guard = 0;
  while (blades.length < budget && guard < budget * 80) {
    guard += 1;
    const blade = makeBlade(
      region.minX + random() * (region.maxX - region.minX),
      region.minZ + random() * (region.maxZ - region.minZ),
      scaleBias,
      lush,
      random,
    );
    if (blade) blades.push(blade);
  }
  return blades;
}

function scatterBlades() {
  const random = seedRandom(21);
  const city = scatterRegion(
    { minX: -CITY_LIMIT, maxX: CITY_LIMIT, minZ: -CITY_LIMIT, maxZ: CITY_LIMIT },
    0.34,
    CITY_TUFTS,
    1,
    false,
    random,
  );
  const park = scatterRegion(PARK, 0.22, PARK_TUFTS, 1.16, true, random);
  return city.concat(park);
}

function mottledGround() {
  const texture = createGrassTexture();
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (context) {
    const random = seedRandom(7);
    for (let i = 0; i < 70; i += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = 28 + random() * 62;
      const light = random() > 0.42;
      const alpha = 0.2 + random() * 0.28;
      const gradient = context.createRadialGradient(x, y, radius * 0.15, x, y, radius);
      gradient.addColorStop(0, light ? `rgba(138, 184, 82, ${alpha})` : `rgba(22, 68, 28, ${alpha})`);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    texture.needsUpdate = true;
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(42, 42);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function Grass() {
  const tufts = useRef<THREE.InstancedMesh>(null);
  const blades = useMemo(() => scatterBlades(), []);
  const geometry = useMemo(() => tuftGeometry(), []);
  const ground = useMemo(() => mottledGround(), []);

  useLayoutEffect(() => {
    const mesh = tufts.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    blades.forEach((blade, index) => {
      dummy.position.set(blade.x, 0.012, blade.z);
      dummy.rotation.set(blade.leanX, blade.yaw, blade.leanZ);
      dummy.scale.set(blade.scaleXZ, blade.scaleY, blade.scaleXZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.set(blade.color);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [blades]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow raycast={() => null}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          color="#ffffff"
          map={ground}
          roughness={1}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <instancedMesh
        ref={tufts}
        args={[geometry, undefined, blades.length]}
        frustumCulled={false}
        raycast={() => null}
      >
        <meshStandardMaterial
          color="#ffffff"
          roughness={1}
          metalness={0}
          side={THREE.DoubleSide}
          vertexColors
          flatShading={false}
        />
      </instancedMesh>
    </group>
  );
}
