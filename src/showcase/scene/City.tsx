import { Sparkles } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import basemap from "../../../data/wellesley/basemap.geojson";
import { POTHOLES, selectPothole, usePotholeFix } from "../../city/potholeFix";
import { createProjector, isFeatureCollection, type ShowcaseBBox } from "../geo";
import { INTERVENTION_EDGE_IDS, SHOWCASE_BBOX } from "../layout";
import { GLASS_TINTS, worldCurtainWall } from "./glass";
import {
  parseBasemap,
  type BuildingFootprint,
  type ParsedBasemap,
  type WayRibbon,
} from "./parseBasemap";
import { createRibbonGeometry } from "./ribbonGeometry";

/**
 * Wellesley, reimagined. Every building, road, and footpath comes from the
 * OpenStreetMap extract in data/wellesley/basemap.geojson, at true position
 * and outline. The buildings are rebuilt as glass with green roofs; heights
 * are a design choice (OSM has none here), not a survey.
 */

/** Scene units per metre. The ~650 m showcase spans about 90 units. */
const CITY_SCALE = 0.14;

type CityModel = {
  parsed: ParsedBasemap;
  /** OSM building tag per footprint id, for the height rule. */
  kinds: Map<string, string>;
  span: number;
};

/** Bounding box of every coordinate in a FeatureCollection. */
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
  // Buildings define the neighborhood; long roads can run far past it.
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
function buildModel(geoJson: unknown): CityModel {
  const bbox = geoJson === basemap ? SHOWCASE_BBOX : (bboxOf(geoJson) ?? SHOWCASE_BBOX);
  const projector = createProjector(bbox, CITY_SCALE);
  const parsed = parseBasemap(geoJson, projector) ?? { buildings: [], ways: [] };
  const kinds = new Map<string, string>();
  if (isFeatureCollection(geoJson)) {
    for (const feature of geoJson.features) {
      const props = (feature as { properties?: Record<string, unknown> }).properties;
      if (props?.layer === "building") kinds.set(String(props.osmId), String(props.building ?? "yes"));
    }
  }
  return { parsed, kinds, span: projector.span };
}

const WELLESLEY = buildModel(basemap);
/** Width of the Wellesley showcase in scene units; the camera frames this. */
export const CITY_SPAN = WELLESLEY.span;

/** One glass bay and one floor, in scene units (about 4 m and 5 m). */
const BAY = 0.55;
const FLOOR_H = 0.75;

/** Floors by OSM building type, before a little per-building variation. */
const FLOORS: Record<string, number> = {
  university: 9,
  college: 7,
  dormitory: 7,
  apartments: 8,
  chapel: 4,
  church: 4,
  house: 3,
  residential: 4,
};

const STONE = "#d9dcd8";
const ROOF_METAL = "#dfe5e8";
const ROOF_GARDEN = "#5f8f55";
const LAWN = "#7d9a68";
const ASPHALT = "#3b4448";
const SMART_LINE = "#8ff3ff";
const LOGO_BLUE = "#1488ff";
const GREEN = ["#3f6f3a", "#4b7d40", "#5a8c48", "#6a9a50"] as const;
const AUTUMN = ["#b98c3a", "#c99a4c", "#b8692c"] as const;

function hash(a: number, b: number) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function idHash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

function centroid(ring: readonly (readonly [number, number])[]): [number, number] {
  let x = 0;
  let z = 0;
  for (const [px, pz] of ring) {
    x += px;
    z += pz;
  }
  return [x / ring.length, z / ring.length];
}

function shrink(
  ring: readonly (readonly [number, number])[],
  factor: number,
): (readonly [number, number])[] {
  const [cx, cz] = centroid(ring);
  return ring.map(([x, z]) => [cx + (x - cx) * factor, cz + (z - cz) * factor] as const);
}

/** Extrude a footprint upward. Shape y is −z so the footprint is not mirrored. */
function extrude(ring: readonly (readonly [number, number])[], height: number) {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function floorsFor(building: BuildingFootprint, kind: string) {
  const base = FLOORS[kind] ?? 6;
  return base + Math.floor(idHash(building.id) * 4);
}

/** Shared glass materials: one per tint, all reading the same pane grid. */
function useGlassMaterials() {
  const materials = useMemo(() => {
    const maps = worldCurtainWall(BAY, FLOOR_H);
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
      roofMetal: new THREE.MeshStandardMaterial({ color: ROOF_METAL, metalness: 0.5, roughness: 0.35 }),
      roofGarden: new THREE.MeshStandardMaterial({ color: ROOF_GARDEN, roughness: 0.95 }),
      stone: new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.72 }),
    };
  }, []);
  useEffect(
    () => () => {
      materials.maps.color.dispose();
      materials.maps.rough.dispose();
      for (const m of materials.glass) m.dispose();
      materials.roofMetal.dispose();
      materials.roofGarden.dispose();
      materials.stone.dispose();
    },
    [materials],
  );
  return materials;
}

type GlassMaterials = ReturnType<typeof useGlassMaterials>;

/** A real Wellesley footprint, rebuilt as a glass building. */
function HoloBuilding({
  building,
  kind,
  materials,
}: {
  building: BuildingFootprint;
  kind: string;
  materials: GlassMaterials;
}) {
  const floors = floorsFor(building, kind);
  const height = floors * FLOOR_H;
  const tall = floors >= 9;
  const crownFloors = tall ? 2 + Math.floor(idHash(building.id) * 2) : 0;
  const glass =
    materials.glass[Math.floor(idHash(building.id) * materials.glass.length)] ??
    materials.glass[0];
  // Lower buildings carry roof gardens; towers finish in a glass crown.
  const roof = tall ? materials.roofMetal : materials.roofGarden;

  const geometry = useMemo(() => {
    const podium = extrude(shrink(building.ring, 1.03), 0.35);
    const shaft = extrude(building.ring, height);
    const crown = crownFloors ? extrude(shrink(building.ring, 0.68), crownFloors * FLOOR_H) : null;
    return { podium, shaft, crown };
  }, [building.ring, height, crownFloors]);

  useEffect(
    () => () => {
      geometry.podium.dispose();
      geometry.shaft.dispose();
      geometry.crown?.dispose();
    },
    [geometry],
  );

  return (
    <group name={building.name ?? building.id}>
      <mesh geometry={geometry.podium} material={materials.stone} castShadow receiveShadow />
      {/* ExtrudeGeometry groups: 0 = roof and floor caps, 1 = walls. */}
      <mesh
        geometry={geometry.shaft}
        material={[roof, glass]}
        position={[0, 0.35, 0]}
        castShadow
        receiveShadow
      />
      {geometry.crown && (
        <mesh
          geometry={geometry.crown}
          material={[materials.roofMetal, glass]}
          position={[0, 0.35 + height, 0]}
          castShadow
        />
      )}
    </group>
  );
}

/** Ground width for each OSM way type, in scene units. */
const WAY_HALF_WIDTH: Record<WayRibbon["layer"], number> = {
  road: 0.62,
  sidewalk: 0.22,
  footway: 0.2,
  path: 0.16,
};

const WAY_COLOR: Record<WayRibbon["layer"], string> = {
  road: ASPHALT,
  sidewalk: "#d3d6d0",
  footway: "#d9d3c4",
  path: "#cfc7b2",
};

const HIGHLIGHT = new Set<string>(INTERVENTION_EDGE_IDS);

function Way({ way }: { way: WayRibbon }) {
  const road = way.layer === "road";
  const lit = Boolean(way.edgeId && HIGHLIGHT.has(way.edgeId));
  const geometry = useMemo(
    () => createRibbonGeometry(way.points, WAY_HALF_WIDTH[way.layer], road ? 0.02 : 0.015, 0.03),
    [way.points, way.layer, road],
  );
  const line = useMemo(
    () => (road ? createRibbonGeometry(way.points, 0.035, 0.052, 0.006) : null),
    [way.points, road],
  );
  useEffect(
    () => () => {
      geometry?.dispose();
      line?.dispose();
    },
    [geometry, line],
  );
  if (!geometry) return null;
  return (
    <group name={way.name ?? way.id}>
      <mesh geometry={geometry} receiveShadow raycast={() => null}>
        <meshStandardMaterial
          color={lit ? LOGO_BLUE : WAY_COLOR[way.layer]}
          emissive={lit ? LOGO_BLUE : "#000000"}
          emissiveIntensity={lit ? 0.6 : 0}
          roughness={road ? 0.85 : 0.9}
        />
      </mesh>
      {line && (
        // Smart-street center line: a faint glow down the middle of the road.
        <mesh geometry={line} raycast={() => null}>
          <meshStandardMaterial
            color={SMART_LINE}
            emissive={SMART_LINE}
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

/** Points every `spacing` units along a polyline, with heading and side offset. */
function along(
  points: readonly (readonly [number, number])[],
  spacing: number,
  offset: number,
) {
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

function pointAt(points: readonly (readonly [number, number])[], fraction: number) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  }
  let goal = total * fraction;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (goal <= len && len > 0) {
      return { x: ax + ((bx - ax) * goal) / len, z: az + ((bz - az) * goal) / len };
    }
    goal -= len;
  }
  const last = points[points.length - 1] ?? [0, 0];
  return { x: last[0], z: last[1] };
}

function Pothole({ id, x, z, size = 1 }: { id: string; x: number; z: number; size?: number }) {
  const fix = usePotholeFix();
  const patched = fix.patchedIds.includes(id);
  const selected = fix.selectedId === id;
  return (
    <group position={[x, 0.06, z]} scale={size}>
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

function Hydrant({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]} scale={0.4}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.84, 8]} />
        <meshStandardMaterial color="#f3c2b4" emissive="#e08978" emissiveIntensity={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.22, 8]} />
        <meshStandardMaterial color="#fff6f2" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Lamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} scale={0.4}>
      <mesh position={[0, 1.45, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 2.9, 6]} />
        <meshStandardMaterial color="#e9edef" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0.34, 2.85, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 0.7, 6]} />
        <meshStandardMaterial color="#e9edef" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0.62, 2.72, 0]}>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshStandardMaterial color="#fff3c4" emissive="#ffe08a" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Bench({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]} scale={0.4}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.42]} />
        <meshStandardMaterial color="#c9a77c" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.68, -0.17]} castShadow>
        <boxGeometry args={[1.5, 0.42, 0.06]} />
        <meshStandardMaterial color="#c9a77c" roughness={0.7} />
      </mesh>
      {[-0.58, 0.58].map((leg) => (
        <mesh key={leg} position={[leg, 0.2, 0]}>
          <boxGeometry args={[0.08, 0.4, 0.36]} />
          <meshStandardMaterial color="#6f7b80" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Roads({ model }: { model: CityModel }) {
  const roads = model.parsed.ways.filter((way) => way.layer === "road");
  const walks = model.parsed.ways.filter((way) => way.layer !== "road");
  // Potholes sit on the real Central Street, the longest road in the extract.
  const central = roads
    .filter((way) => way.name === "Central Street")
    .sort((a, b) => b.points.length - a.points.length)[0];
  const holes = central ? [0.3, 0.5, 0.7].map((f) => pointAt(central.points, f)) : [];

  return (
    <group name="wellesley-streets">
      {walks.map((way) => (
        <Way key={way.id} way={way} />
      ))}
      {roads.map((way) => (
        <Way key={way.id} way={way} />
      ))}
      {holes.map((spot, index) => {
        const hole = POTHOLES[index];
        if (!hole) return null;
        return <Pothole key={hole.id} id={hole.id} x={spot.x} z={spot.z} size={0.38} />;
      })}
      {roads.flatMap((way) =>
        along(way.points, 7, WAY_HALF_WIDTH.road + 0.35).map((spot) => (
          <Lamp key={`lamp-${way.id}-${spot.x.toFixed(2)}`} x={spot.x} z={spot.z} />
        )),
      )}
      {roads.flatMap((way) =>
        along(way.points, 19, -(WAY_HALF_WIDTH.road + 0.3)).map((spot) => (
          <Hydrant key={`hydrant-${way.id}-${spot.x.toFixed(2)}`} x={spot.x} z={spot.z} rot={spot.rot} />
        )),
      )}
      {walks
        .filter((way) => way.layer === "footway")
        .flatMap((way) =>
          along(way.points, 13, WAY_HALF_WIDTH.footway + 0.3).map((spot) => (
            <Bench key={`bench-${way.id}-${spot.x.toFixed(2)}`} x={spot.x} z={spot.z} rot={spot.rot} />
          )),
        )}
    </group>
  );
}

function insideRing(x: number, z: number, ring: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x: number, z: number, a: readonly [number, number], b: readonly [number, number]) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** Trees on open lawn only: never inside a footprint or on a road or path. */
function plantTrees(model: CityModel) {
  const out: { x: number; z: number; s: number; color: string }[] = [];
  const half = model.span / 2;
  const step = 2.4;
  const grown = model.parsed.buildings.map((b) => shrink(b.ring, 1.18));
  for (let gx = -half; gx <= half; gx += step) {
    for (let gz = -half; gz <= half; gz += step) {
      const r = hash(gx, gz);
      if (r < 0.45) continue;
      const x = gx + (hash(gz, gx) - 0.5) * step;
      const z = gz + (hash(gx + 7, gz) - 0.5) * step;
      if (grown.some((ring) => insideRing(x, z, ring))) continue;
      const nearWay = model.parsed.ways.some((way) =>
        way.points.some((p, i) => {
          const q = way.points[i + 1];
          return q ? distToSegment(x, z, p, q) < WAY_HALF_WIDTH[way.layer] + 0.7 : false;
        }),
      );
      if (nearWay) continue;
      const palette = r > 0.9 ? AUTUMN : GREEN;
      out.push({
        x,
        z,
        s: 0.75 + hash(x, z) * 0.6,
        color: palette[Math.floor(hash(z, x) * palette.length)] ?? GREEN[0],
      });
    }
  }
  return out;
}

/** Hundreds of trees in two draw calls: one for trunks, one for canopies. */
function Trees({ model }: { model: CityModel }) {
  const trees = useMemo(() => plantTrees(model), [model]);
  const { trunks, canopies } = useMemo(() => {
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.06, 0.09, 0.9, 6),
      new THREE.MeshStandardMaterial({ color: "#5c4634", roughness: 0.9 }),
      trees.length,
    );
    const canopy = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.62, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
      trees.length,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    trees.forEach((tree, i) => {
      m.compose(new THREE.Vector3(tree.x, 0.45 * tree.s, tree.z), q, new THREE.Vector3(tree.s, tree.s, tree.s));
      trunk.setMatrixAt(i, m);
      m.compose(
        new THREE.Vector3(tree.x, 1.15 * tree.s, tree.z),
        q,
        new THREE.Vector3(tree.s, tree.s * 1.15, tree.s),
      );
      canopy.setMatrixAt(i, m);
      canopy.setColorAt(i, color.set(tree.color));
    });
    for (const mesh of [trunk, canopy]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.raycast = () => null;
    }
    return { trunks: trunk, canopies: canopy };
  }, [trees]);
  useEffect(
    () => () => {
      for (const mesh of [trunks, canopies]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
    },
    [trunks, canopies],
  );
  return (
    <group name="trees">
      <primitive object={trunks} />
      <primitive object={canopies} />
    </group>
  );
}

/**
 * The glass city. With no map it shows the Wellesley showcase; given a
 * loaded neighborhood (same FeatureCollection shape) it rebuilds from that.
 */
export function City({ geoJson }: { geoJson?: unknown }) {
  const materials = useGlassMaterials();
  const model = useMemo(
    () => (geoJson && geoJson !== basemap ? buildModel(geoJson) : WELLESLEY),
    [geoJson],
  );
  return (
    <group name="wellesley-reimagined">
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
        raycast={() => null}
      >
        {/* Wide enough that the fog hides its edge from any camera angle. */}
        <planeGeometry args={[CITY_SPAN * 10, CITY_SPAN * 10]} />
        <meshStandardMaterial color={LAWN} roughness={0.95} />
      </mesh>
      <Roads model={model} />
      {model.parsed.buildings.map((building) => (
        <HoloBuilding
          key={building.id}
          building={building}
          kind={model.kinds.get(building.id) ?? "yes"}
          materials={materials}
        />
      ))}
      <Trees model={model} />
      <Sparkles count={90} scale={CITY_SPAN} size={2.4} speed={0.16} color="#ffffff" opacity={0.45} />
    </group>
  );
}
