import { Edges, Sparkles } from "@react-three/drei";

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

const BLOCKS = [-27, -9, 9, 27] as const;

function buildCity(): { lots: Lot[]; trees: TreeSpec[]; plaza: { x: number; z: number } } {
  const lots: Lot[] = [];
  const trees: TreeSpec[] = [];

  BLOCKS.forEach((x, ix) => {
    BLOCKS.forEach((z, iz) => {
      const downtown = Math.abs(x) + Math.abs(z) <= 18;
      if (x === -27 && z === -27) {
        for (let t = 0; t < 7; t += 1) {
          trees.push({
            x: x + (hash(t, ix) - 0.5) * 8,
            z: z + (hash(iz, t) - 0.5) * 8,
            leaf: pickLeaf(ix + t, iz),
            scale: 0.95 + hash(t, iz) * 0.4,
          });
        }
        return;
      }
      const w = downtown ? 5.4 + hash(ix, iz) * 1.4 : 4.2 + hash(ix, iz) * 1.2;
      const d = downtown ? 5 + hash(iz, ix) * 1.3 : 3.8 + hash(iz, ix) * 1.1;
      const h = downtown ? 12 + hash(ix + 2, iz) * 12 : 3.6 + hash(ix, iz + 2) * 5;
      lots.push({
        x: x + (hash(ix, iz) - 0.5) * 1.2,
        z: z + (hash(iz, ix) - 0.5) * 1.2,
        w,
        d,
        h,
        glow: downtown ? 0.75 : 0.28,
        stepped: downtown && h > 14,
        wire: false,
      });
      trees.push({
        x: x + 5.2,
        z: z - 4.6,
        leaf: pickLeaf(ix, iz + 3),
        scale: 0.85 + hash(ix, 4) * 0.3,
      });
    });
  });

  trees.push({ x: -27, z: -27, leaf: CRYSTAL, scale: 1.2, crystal: true });
  return { lots, trees, plaza: { x: -27, z: -27 } };
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

function ellipse(cx: number, cz: number, rx: number, rz: number, steps: number) {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * rx, cz + Math.sin(angle) * rz]);
  }
  return points;
}

const BOULEVARD = quad([-62, -24], [2, 28], [64, 4], 24);
const SWEEP = quad([-56, 36], [6, -18], [60, 30], 22);
const CRESCENT = quad([-34, -10], [4, 32], [36, -4], 16);
const LOOP = ellipse(9, 7, 24, 15, 32);

function Ribbon({
  points,
  width,
  color = ROAD,
  y = 0.05,
  glow = 1.15,
}: {
  points: readonly (readonly [number, number])[];
  width: number;
  color?: string;
  y?: number;
  glow?: number;
}) {
  return (
    <group>
      {points.slice(0, -1).map((from, index) => (
        <GlowSeg
          key={index}
          from={from}
          to={points[index + 1] ?? from}
          width={width}
          color={color}
          y={y}
          glow={glow}
        />
      ))}
    </group>
  );
}

function Pothole({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, 0.09, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <circleGeometry args={[0.72, 8]} />
      <meshStandardMaterial color="#061820" roughness={1} />
    </mesh>
  );
}

const STREETS = [-36, -18, 0, 18, 36] as const;

function CurvedRoads() {
  const span = 54;
  const curb = 1.7;
  return (
    <group>
      {STREETS.map((z) => (
        <group key={`h-${z}`}>
          <GlowSeg from={[-span, z]} to={[span, z]} width={4.8} color="#103f4c" y={0.03} glow={0.12} />
          <GlowSeg from={[-span, z]} to={[span, z]} width={3.2} color="#1a7584" y={0.055} glow={0.4} />
          <GlowSeg from={[-span, z - curb]} to={[span, z - curb]} width={0.12} color="#f4ffff" y={0.09} glow={0.75} />
          <GlowSeg from={[-span, z + curb]} to={[span, z + curb]} width={0.12} color="#f4ffff" y={0.09} glow={0.75} />
          <GlowSeg from={[-span, z]} to={[span, z]} width={0.08} color="#f7ffff" y={0.1} glow={0.55} />
        </group>
      ))}
      {STREETS.map((x) => (
        <group key={`v-${x}`}>
          <GlowSeg from={[x, -span]} to={[x, span]} width={4.8} color="#103f4c" y={0.03} glow={0.12} />
          <GlowSeg from={[x, -span]} to={[x, span]} width={3.2} color="#1a7584" y={0.055} glow={0.4} />
          <GlowSeg from={[x - curb, -span]} to={[x - curb, span]} width={0.12} color="#f4ffff" y={0.09} glow={0.75} />
          <GlowSeg from={[x + curb, -span]} to={[x + curb, span]} width={0.12} color="#f4ffff" y={0.09} glow={0.75} />
          <GlowSeg from={[x, -span]} to={[x, span]} width={0.08} color="#f7ffff" y={0.1} glow={0.55} />
        </group>
      ))}
      <Pothole x={0} z={9} />
      <Pothole x={-18} z={0} />
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
  const hydrants = [2, 6, 10, 14, 18, 22].map((index) => beside(BOULEVARD, index, 1.7));
  const lamps = [1, 4, 7, 10, 13, 16, 19].map((index) => beside(SWEEP, index, -1.8));
  const benches = [2, 6, 10, 14].map((index) => beside(CRESCENT, index, 1.55));
  const walks = [5, 12, 19].map((index) => beside(BOULEVARD, index, 0));
  const stop = beside(BOULEVARD, 11, -2.4);
  const bins = [8, 16].map((index) => beside(LOOP, index, 1.5));
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
