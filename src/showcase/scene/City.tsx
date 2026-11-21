import { Edges, Sparkles } from "@react-three/drei";
import { POTHOLES, selectPothole, usePotholeFix } from "../../city/potholeFix";

const GLASS = "#3ec8d8";
const GLASS_GLOW = "#7af4ff";
const EDGE = "#f8ffff";
const GROUND = "#0a3842";
const ROAD = "#e8fbff";
const CRYSTAL = "#f4ffff";

type Lot = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  glow: number;
  stepped: boolean;
  wire: boolean;
};

type TreeSpec = {
  x: number;
  z: number;
  leaf: string;
  scale: number;
  crystal?: boolean;
};

const GREEN = ["#2f6a32", "#3d7a38", "#5a9a48", "#6ea84a"] as const;
const AUTUMN = ["#c4a03a", "#d7b25a", "#c9782a"] as const;

function hash(a: number, b: number) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function pickLeaf(ix: number, iz: number) {
  return hash(ix + 3, iz + 11) < 0.6
    ? GREEN[Math.floor(hash(ix, iz) * GREEN.length) % GREEN.length]
    : AUTUMN[Math.floor(hash(iz, ix) * AUTUMN.length) % AUTUMN.length];
}

function buildCity(): { lots: Lot[]; trees: TreeSpec[]; plaza: { x: number; z: number } } {
  const lots: Lot[] = [];
  const trees: TreeSpec[] = [];
  const STEP = 16;
  const downtown = { x: 8, z: 6 };

  for (let ix = -4; ix <= 4; ix += 1) {
    for (let iz = -4; iz <= 4; iz += 1) {
      if (ix === 0 && iz === 0) continue;
      const x = ix * STEP + (hash(ix, iz) - 0.5) * 4.4;
      const z = iz * STEP + (hash(iz, ix + 9) - 0.5) * 4.4;
      const dist = Math.hypot(x - downtown.x, z - downtown.z);
      if (hash(ix * 3, iz * 7) < 0.22 && dist > 22) {
        const count = 3 + Math.floor(hash(ix, iz) * 3);
        for (let t = 0; t < count; t += 1) {
          trees.push({
            x: x + (hash(ix + t, iz) - 0.5) * 9,
            z: z + (hash(iz, ix + t + 4) - 0.5) * 9,
            leaf: pickLeaf(ix + t, iz),
            scale: 0.9 + hash(t, ix) * 0.55,
          });
        }
        continue;
      }

      const downtownLot = dist < 20;
      const w = downtownLot ? 4.1 + hash(ix + 1, iz) * 2.4 : 3.0 + hash(ix + 1, iz) * 3.4;
      const d = downtownLot ? 3.9 + hash(ix, iz + 1) * 2.3 : 2.9 + hash(ix, iz + 1) * 3.2;
      const h = downtownLot ? 8 + hash(ix, iz) * 12 : 3.4 + hash(ix, iz) * 8;
      lots.push({
        x,
        z,
        w,
        d,
        h,
        glow: downtownLot ? 0.62 : 0.22,
        stepped: downtownLot && h > 10,
        wire: dist > 38,
      });
      trees.push({
        x: x + (hash(ix, iz) > 0.5 ? 1 : -1) * (w * 0.5 + 2.1),
        z: z + (hash(iz, ix) - 0.5) * (d + 2.4),
        leaf: pickLeaf(ix, iz + 5),
        scale: 0.8 + hash(ix, 3) * 0.45,
      });
    }
  }

  lots.push(
    { x: 8.2, z: 7.4, w: 5.1, d: 5.3, h: 22, glow: 0.95, stepped: true, wire: false },
    { x: 13.4, z: 6.2, w: 4.6, d: 4.8, h: 11, glow: 0.8, stepped: true, wire: false },
    { x: 12.8, z: 11.8, w: 3.4, d: 3.4, h: 16, glow: 0.78, stepped: true, wire: false },
    { x: 4.0, z: 12.2, w: 4.0, d: 4.4, h: 10, glow: 0.62, stepped: true, wire: false },
    { x: 7.2, z: 2.6, w: 3.4, d: 3.5, h: 7.2, glow: 0.48, stepped: false, wire: false },
  );

  trees.push(
    { x: -6.8, z: 4.0, leaf: CRYSTAL, scale: 1.15, crystal: true },
    { x: 2.4, z: 18.6, leaf: "#c4a03a", scale: 1.28 },
    { x: 19.2, z: 3.2, leaf: "#3d7a38", scale: 1.12 },
    { x: 20.6, z: 14.4, leaf: "#d7b25a", scale: 1.08 },
    { x: -3.2, z: -9.4, leaf: "#6ea84a", scale: 1.18 },
    { x: 16.4, z: -8.2, leaf: "#c9782a", scale: 1.05 },
  );

  return { lots, trees, plaza: { x: 8.8, z: 1.6 } };
}

const CITY = buildCity();

function HoloBuilding({ x, z, w, d, h, glow, stepped, wire }: Lot) {
  const fill = wire ? 0.55 : 0.9 + glow * 0.15;
  const floors = Math.min(7, Math.max(3, Math.floor(h / 2.1)));
  const crown = stepped ? h * 0.22 : 0;
  const story = (index: number) => 0.85 + ((h - 1.1) * (index + 1)) / (floors + 1);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.38, 0]} castShadow>
        <boxGeometry args={[w * 1.14, 0.76, d * 1.14]} />
        <meshStandardMaterial color="#146e7c" emissive="#7af4ff" emissiveIntensity={0.35} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.38 + h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={GLASS}
          emissive={GLASS_GLOW}
          emissiveIntensity={fill}
          roughness={0.18}
          metalness={0.22}
        />
        <Edges threshold={15} color={EDGE} />
      </mesh>
      {Array.from({ length: floors }, (_, index) => (
        <mesh key={`floor-${index}`} position={[0, story(index), 0]} raycast={() => null}>
          <boxGeometry args={[w * 1.012, 0.045, d * 1.012]} />
          <meshBasicMaterial color="#f4ffff" transparent opacity={0.72} />
        </mesh>
      ))}
      {Array.from({ length: floors }, (_, row) =>
        ([-0.3, 0, 0.3] as const).map((nx) => {
          const lit = (row + (nx > 0 ? 1 : 0)) % 3 === 0;
          const paneH = Math.max(0.32, (h / floors) * 0.42);
          return (
            <group key={`win-${row}-${nx}`}>
              <mesh position={[nx * w, story(row) - paneH * 0.7, d / 2 + 0.03]} raycast={() => null}>
                <boxGeometry args={[w * 0.2, paneH, 0.03]} />
                <meshStandardMaterial
                  color={lit ? "#e9fdff" : "#0d4552"}
                  emissive={lit ? "#c8f7ff" : "#1c7f8e"}
                  emissiveIntensity={lit ? 1.15 : 0.4}
                  roughness={0.12}
                />
              </mesh>
              <mesh position={[w / 2 + 0.03, story(row) - paneH * 0.7, nx * d]} raycast={() => null}>
                <boxGeometry args={[0.03, paneH, d * 0.2]} />
                <meshStandardMaterial
                  color={lit ? "#e9fdff" : "#0d4552"}
                  emissive={lit ? "#c8f7ff" : "#1c7f8e"}
                  emissiveIntensity={lit ? 0.9 : 0.35}
                  roughness={0.12}
                />
              </mesh>
            </group>
          );
        }),
      )}
      {([-1, 1] as const).map((side) => (
        <mesh key={`mullion-${side}`} position={[side * w * 0.22, 0.38 + h / 2, d / 2 + 0.02]} raycast={() => null}>
          <boxGeometry args={[0.05, h * 0.96, 0.04]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      <mesh position={[0, 0.38 + h + 0.06, 0]} raycast={() => null}>
        <boxGeometry args={[w * 1.04, 0.1, d * 1.04]} />
        <meshStandardMaterial color="#f7ffff" emissive="#ffffff" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[w * 0.12, 0.38 + h + 0.38, d * 0.08]}>
        <boxGeometry args={[w * 0.38, 0.42, d * 0.32]} />
        <meshStandardMaterial color="#d8fbff" emissive="#7af4ff" emissiveIntensity={0.7} roughness={0.3} />
      </mesh>
      {stepped && (
        <mesh position={[0, 0.38 + h + crown / 2, 0]} castShadow>
          <boxGeometry args={[w * 0.58, crown, d * 0.54]} />
          <meshStandardMaterial color="#7af4ff" emissive="#d8fbff" emissiveIntensity={1.05} roughness={0.16} />
          <Edges threshold={12} color="#ffffff" />
        </mesh>
      )}
      {h > 14 && (
        <mesh position={[w * 0.12, 0.38 + h + crown + 0.9, d * 0.08]} raycast={() => null}>
          <cylinderGeometry args={[0.04, 0.04, 1.4, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </group>
  );
}

function HoloTree({ x, z, leaf, scale, crystal }: TreeSpec) {
  const canopy = crystal ? CRYSTAL : leaf;
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 2.1, 8]} />
        <meshStandardMaterial
          color={crystal ? "#cfeef4" : "#5c4634"}
          emissive={crystal ? "#d7fbff" : "#000000"}
          emissiveIntensity={crystal ? 0.5 : 0}
          roughness={0.92}
        />
      </mesh>
      <mesh position={[0, 2.35, 0]} castShadow>
        <sphereGeometry args={[crystal ? 1.25 : 0.95, 16, 12]} />
        <meshStandardMaterial
          color={canopy}
          emissive={crystal ? "#e9ffff" : "#000000"}
          emissiveIntensity={crystal ? 0.6 : 0}
          roughness={crystal ? 0.32 : 0.88}
          transparent={Boolean(crystal)}
          opacity={crystal ? 0.84 : 1}
        />
      </mesh>
      <mesh position={[0.38, 2.7, 0.22]} castShadow>
        <sphereGeometry args={[crystal ? 0.7 : 0.52, 12, 10]} />
        <meshStandardMaterial
          color={canopy}
          emissive={crystal ? "#f4ffff" : "#000000"}
          emissiveIntensity={crystal ? 0.45 : 0}
          roughness={crystal ? 0.3 : 0.88}
        />
      </mesh>
    </group>
  );
}

function GlowSeg({
  from,
  to,
  width = 0.13,
  color = ROAD,
  y = 0.05,
  glow = 1.15,
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  width?: number;
  color?: string;
  y?: number;
  glow?: number;
}) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return null;
  return (
    <mesh
      position={[(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]}
      rotation={[0, Math.atan2(dx, dz), 0]}
      receiveShadow
      raycast={() => null}
    >
      <boxGeometry args={[width, 0.045, len]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={glow}
        roughness={0.35}
        toneMapped={glow > 0.4}
      />
    </mesh>
  );
}

/** Driving surface in the same cyan family as the glass, wide enough to read as a street. */
const DECK = "#1a7584";
const WALK = "#103f4c";
const CURB = "#f4ffff";
const LANE = "#f7ffff";

const AVENUES = [-40, -16, 8, 32];
const CROSS_STREETS = [-36, -12, 12, 36];

function quad(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  steps: number,
) {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
      u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
    ]);
  }
  return points;
}

const BOULEVARD = quad([-62, -20], [4, 18], [64, -6], 28);

function shift(
  from: readonly [number, number],
  to: readonly [number, number],
  offset: number,
): { from: [number, number]; to: [number, number] } {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len;
  const nz = dx / len;
  return {
    from: [from[0] + nx * offset, from[1] + nz * offset],
    to: [to[0] + nx * offset, to[1] + nz * offset],
  };
}

function Pothole({ id, x, z }: { id: string; x: number; z: number }) {
  const fix = usePotholeFix();
  const patched = fix.patchedIds.includes(id);
  const selected = fix.selectedId === id;
  return (
    <group position={[x, 0.1, z]}>
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
        <circleGeometry args={[1.2, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function LaneDashes({ from, to }: { from: readonly [number, number]; to: readonly [number, number] }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  if (len < 1) return null;
  const ux = dx / len;
  const uz = dz / len;
  const dashes: Array<readonly [readonly [number, number], readonly [number, number]]> = [];
  for (let dist = 0.6; dist < len - 0.6; dist += 1.8) {
    const end = Math.min(dist + 0.85, len - 0.4);
    dashes.push([
      [from[0] + ux * dist, from[1] + uz * dist],
      [from[0] + ux * end, from[1] + uz * end],
    ]);
  }
  return (
    <group>
      {dashes.map(([start, end], index) => (
        <GlowSeg key={index} from={start} to={end} width={0.1} color={LANE} y={0.1} glow={0.7} />
      ))}
    </group>
  );
}

/** A photo-style street: sidewalk, deck, curb, edge lines, dashed center. Colors stay in the glass palette. */
function Paved({
  from,
  to,
  width = 3.6,
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  width?: number;
}) {
  const half = width / 2;
  const leftCurb = shift(from, to, -(half + 0.08));
  const rightCurb = shift(from, to, half + 0.08);
  const leftEdge = shift(from, to, -(half - 0.22));
  const rightEdge = shift(from, to, half - 0.22);
  return (
    <group>
      <GlowSeg from={from} to={to} width={width + 2.2} color={WALK} y={0.03} glow={0.18} />
      <GlowSeg from={from} to={to} width={width} color={DECK} y={0.055} glow={0.42} />
      <GlowSeg from={leftCurb.from} to={leftCurb.to} width={0.14} color={CURB} y={0.09} glow={0.85} />
      <GlowSeg from={rightCurb.from} to={rightCurb.to} width={0.14} color={CURB} y={0.09} glow={0.85} />
      <GlowSeg from={leftEdge.from} to={leftEdge.to} width={0.07} color={LANE} y={0.1} glow={0.55} />
      <GlowSeg from={rightEdge.from} to={rightEdge.to} width={0.07} color={LANE} y={0.1} glow={0.55} />
      <LaneDashes from={from} to={to} />
    </group>
  );
}

function CurvedRoads() {
  const holes = [6, 14, 22].map((index) => beside(BOULEVARD, index, 0.2));
  return (
    <group>
      {BOULEVARD.slice(0, -1).map((from, index) => (
        <Paved key={`bend-${index}`} from={from} to={BOULEVARD[index + 1] ?? from} width={3.8} />
      ))}
      {holes.map((spot, index) => {
        const hole = POTHOLES[index];
        if (!hole) return null;
        return <Pothole key={hole.id} id={hole.id} x={spot.x} z={spot.z} />;
      })}
    </group>
  );
}

function StreetGrid() {
  const span = 58;
  return (
    <group>
      {CROSS_STREETS.map((z) => (
        <Paved key={`h-${z}`} from={[-span, z]} to={[span, z]} />
      ))}
      {AVENUES.map((x) => (
        <Paved key={`v-${x}`} from={[x, -span]} to={[x, span]} />
      ))}
    </group>
  );
}

function beside(points: readonly (readonly [number, number])[], index: number, dist: number) {
  const prev = points[Math.max(0, index - 1)] ?? points[index]!;
  const next = points[Math.min(points.length - 1, index + 1)] ?? points[index]!;
  const dx = next[0] - prev[0];
  const dz = next[1] - prev[1];
  const len = Math.hypot(dx, dz) || 1;
  const here = points[index] ?? prev;
  return {
    x: here[0] + (-dz / len) * dist,
    z: here[1] + (dx / len) * dist,
    rot: Math.atan2(dx, dz),
  };
}

function Hydrant({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.84, 8]} />
        <meshStandardMaterial color="#f3c2b4" emissive="#e08978" emissiveIntensity={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.22, 8]} />
        <meshStandardMaterial color="#fff6f2" roughness={0.4} />
      </mesh>
      <mesh position={[0.28, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.22, 6]} />
        <meshStandardMaterial color="#fff6f2" />
      </mesh>
      <mesh position={[-0.28, 0.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.22, 6]} />
        <meshStandardMaterial color="#fff6f2" />
      </mesh>
    </group>
  );
}

function Lamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.45, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 2.9, 6]} />
        <meshStandardMaterial color="#f4ffff" emissive="#d8fbff" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0.34, 2.85, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 0.7, 6]} />
        <meshStandardMaterial color="#f4ffff" />
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
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.42]} />
        <meshStandardMaterial color="#f7fbff" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.68, -0.17]} castShadow>
        <boxGeometry args={[1.5, 0.42, 0.06]} />
        <meshStandardMaterial color="#d7eef4" roughness={0.5} />
      </mesh>
      {[-0.58, 0.58].map((leg) => (
        <mesh key={leg} position={[leg, 0.2, 0]}>
          <boxGeometry args={[0.08, 0.4, 0.36]} />
          <meshStandardMaterial color="#9fd0da" />
        </mesh>
      ))}
    </group>
  );
}

function Crosswalk({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0.07, z]} rotation={[0, rot, 0]}>
      {[-0.7, -0.28, 0.14, 0.56].map((along) => (
        <mesh key={along} position={[0, 0, along]} raycast={() => null}>
          <boxGeometry args={[1.7, 0.02, 0.16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

function Shelter({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[2.2, 2.1, 0.9]} />
        <meshStandardMaterial
          color={GLASS}
          emissive={GLASS_GLOW}
          emissiveIntensity={0.45}
          transparent
          opacity={0.55}
          roughness={0.15}
        />
      </mesh>
      <mesh position={[0, 2.28, 0]}>
        <boxGeometry args={[2.4, 0.08, 1.05]} />
        <meshStandardMaterial color="#f4ffff" />
      </mesh>
      <mesh position={[0, 0.38, 0.1]}>
        <boxGeometry args={[1.8, 0.1, 0.4]} />
        <meshStandardMaterial color="#f7fbff" />
      </mesh>
    </group>
  );
}

function Bin({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, 0.45, z]} castShadow>
      <cylinderGeometry args={[0.22, 0.2, 0.9, 8]} />
      <meshStandardMaterial color="#1f6f7c" roughness={0.6} />
    </mesh>
  );
}

function StreetLife() {
  const hydrants = [4, 10, 16, 22].map((index) => beside(BOULEVARD, index, 2.5));
  const lamps = [3, 9, 15, 21].map((index) => beside(BOULEVARD, index, -2.6));
  const benches = [7, 18].map((index) => beside(BOULEVARD, index, 2.7));
  const walks = [8, 16].map((index) => beside(BOULEVARD, index, 0));
  const stop = beside(BOULEVARD, 12, -3.1);
  const bins = [6, 20].map((index) => beside(BOULEVARD, index, 3.1));
  return (
    <group>
      {hydrants.map((spot) => (
        <Hydrant key={`hydrant-${spot.x.toFixed(1)}`} x={spot.x} z={spot.z} rot={spot.rot} />
      ))}
      {lamps.map((spot) => (
        <Lamp key={`lamp-${spot.x.toFixed(1)}`} x={spot.x} z={spot.z} />
      ))}
      {benches.map((spot) => (
        <Bench key={`bench-${spot.x.toFixed(1)}`} x={spot.x} z={spot.z} rot={spot.rot} />
      ))}
      {walks.map((spot) => (
        <Crosswalk key={`walk-${spot.x.toFixed(1)}`} x={spot.x} z={spot.z} rot={spot.rot} />
      ))}
      <Shelter x={stop.x} z={stop.z} rot={stop.rot} />
      {bins.map((spot) => (
        <Bin key={`bin-${spot.x.toFixed(1)}`} x={spot.x} z={spot.z} />
      ))}
    </group>
  );
}

function Roads() {
  return (
    <group>
      <StreetGrid />
      <CurvedRoads />
      <StreetLife />
    </group>
  );
}

function Plaza({ x, z }: { x: number; z: number }) {
  const s = 3.4;
  return (
    <group position={[x, 0.08, z]}>
      <GlowSeg from={[-s, -s]} to={[s, -s]} width={0.3} />
      <GlowSeg from={[-s, s]} to={[s, s]} width={0.3} />
      <GlowSeg from={[-s, -s]} to={[-s, s]} width={0.3} />
      <GlowSeg from={[s, -s]} to={[s, s]} width={0.3} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[s * 1.3, s * 1.3]} />
        <meshStandardMaterial
          color="#7fe0ea"
          transparent
          opacity={0.32}
          emissive="#c4f7ff"
          emissiveIntensity={0.6}
        />
      </mesh>
    </group>
  );
}

export function City() {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color={GROUND} roughness={0.95} metalness={0.08} />
      </mesh>
      <Roads />
      {CITY.lots.map((lot) => (
        <HoloBuilding key={`b-${lot.x}-${lot.z}`} {...lot} />
      ))}
      {CITY.trees.map((tree) => (
        <HoloTree key={`t-${tree.x}-${tree.z}`} {...tree} />
      ))}
      <Plaza x={CITY.plaza.x} z={CITY.plaza.z} />
      <pointLight position={[9, 16, 7]} intensity={26} distance={52} color="#c8fbff" />
      <Sparkles count={160} scale={110} size={3.4} speed={0.16} color="#e8ffff" opacity={0.72} />
    </group>
  );
}
