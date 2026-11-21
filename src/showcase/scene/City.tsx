import { Edges, Sparkles } from "@react-three/drei";

const GLASS = "#9ee7ef";
const GLASS_GLOW = "#7af0fa";
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

function Glass({
  opacity,
  glow,
}: {
  opacity: number;
  glow: number;
}) {
  return (
        <meshStandardMaterial
      color={GLASS}
      transparent
      opacity={opacity}
      roughness={0.08}
      metalness={0.42}
      emissive={GLASS_GLOW}
      emissiveIntensity={glow}
    />
  );
}

function HoloBuilding({ x, z, w, d, h, glow, stepped, wire }: Lot) {
  const opacity = wire ? 0.18 : 0.34 + glow * 0.12;
  const floors = Math.max(2, Math.floor(h / 3.2));
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <Glass opacity={opacity} glow={glow} />
        <Edges threshold={12} color={EDGE} />
      </mesh>
      {Array.from({ length: floors }, (_, index) => (
        <mesh
          key={`floor-${index}`}
          position={[0, (h / (floors + 1)) * (index + 1), 0]}
          raycast={() => null}
        >
          <boxGeometry args={[w * 1.01, 0.035, d * 1.01]} />
          <meshBasicMaterial color={EDGE} transparent opacity={0.45} />
        </mesh>
      ))}
      {stepped && (
        <mesh position={[0, h + h * 0.16, 0]} castShadow>
          <boxGeometry args={[w * 0.6, h * 0.32, d * 0.56]} />
          <Glass opacity={opacity + 0.06} glow={glow + 0.12} />
          <Edges threshold={12} color={EDGE} />
        </mesh>
      )}
      <mesh position={[0, h + (stepped ? h * 0.34 : 0.1), 0]}>
        <boxGeometry args={[Math.max(1.05, w * 0.4), 0.14, Math.max(1.05, d * 0.4)]} />
        <meshStandardMaterial
          color="#d4f7ff"
          transparent
          opacity={0.8}
          emissive="#ffffff"
          emissiveIntensity={0.45}
        />
        <Edges color="#ffffff" threshold={15} />
      </mesh>
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
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  width?: number;
}) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return null;
  return (
    <mesh
      position={[(from[0] + to[0]) / 2, 0.05, (from[1] + to[1]) / 2]}
      rotation={[0, Math.atan2(dx, dz), 0]}
      receiveShadow
      raycast={() => null}
    >
      <boxGeometry args={[width, 0.045, len]} />
      <meshStandardMaterial
        color={ROAD}
        emissive={ROAD}
        emissiveIntensity={1.15}
        roughness={0.14}
        toneMapped={false}
      />
    </mesh>
  );
}

function CircuitGrid() {
  const lanes: number[] = [];
  for (let i = -48; i <= 48; i += 12) lanes.push(i);
  return (
    <group>
      {lanes.map((lane) =>
        lanes.slice(0, -1).map((start, index) => {
          const end = lanes[index + 1] ?? start;
          const skipX = hash(lane, start) < 0.16;
          const skipZ = hash(start, lane) < 0.16;
          return (
            <group key={`${lane}-${start}`}>
              {!skipX && <GlowSeg from={[lane, start]} to={[lane, end]} />}
              {!skipZ && <GlowSeg from={[start, lane]} to={[end, lane]} />}
            </group>
          );
        }),
      )}
      {lanes.map((x) =>
        lanes.map((z) => (
          <mesh
            key={`dot-${x}-${z}`}
            position={[x, 0.05, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <torusGeometry args={[0.28, 0.05, 6, 10]} />
            <meshStandardMaterial
              color={ROAD}
              emissive={ROAD}
              emissiveIntensity={1.05}
              roughness={0.14}
              toneMapped={false}
            />
          </mesh>
        )),
      )}
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
      <CircuitGrid />
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
