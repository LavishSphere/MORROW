import basemap from "../../../data/wellesley/basemap.geojson";
import { defaultProjector } from "../../showcase/layout";
import { parseBasemap } from "../../showcase/scene/parseBasemap";

const BLUE = "#1488FF";
const WHITE = "#ffffff";

type Planting = {
  id: string;
  x: number;
  z: number;
  scale: number;
  whiteCanopy: boolean;
  lean: number;
};

/** A point just outside the farthest footprint corner, on the ground. */
function plantOnFootprint(ring: readonly (readonly [number, number])[]): { x: number; z: number } {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of ring) {
    cx += x;
    cz += z;
  }
  cx /= ring.length;
  cz /= ring.length;

  let cornerX = ring[0][0];
  let cornerZ = ring[0][1];
  let best = -1;
  for (const [x, z] of ring) {
    const dist = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    if (dist > best) {
      best = dist;
      cornerX = x;
      cornerZ = z;
    }
  }

  const dx = cornerX - cx;
  const dz = cornerZ - cz;
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: cornerX + (dx / len) * 0.46,
    z: cornerZ + (dz / len) * 0.46,
  };
}

function createPlantings(): Planting[] {
  const parsed = parseBasemap(basemap, defaultProjector);
  if (!parsed) return [];
  return parsed.buildings.map((building, index) => {
    const spot = plantOnFootprint(building.ring);
    return {
      id: building.id,
      x: spot.x,
      z: spot.z,
      scale: 1.15 + ((index * 17) % 40) / 100,
      whiteCanopy: index % 3 === 0,
      lean: ((index % 5) - 2) * 0.03,
    };
  });
}

const PLANTINGS = createPlantings();

function Canopy({ whiteCanopy, lean }: { whiteCanopy: boolean; lean: number }) {
  const leaf = whiteCanopy ? WHITE : BLUE;
  const crown = whiteCanopy ? BLUE : WHITE;
  return (
    <group>
      <mesh position={[0, 0.22, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.045, 0.06, 0.44, 7]} />
        <meshStandardMaterial color={WHITE} roughness={0.72} />
      </mesh>
      <mesh position={[lean, 0.58, lean * 0.4]} raycast={() => null}>
        <sphereGeometry args={[0.3, 16, 12]} />
        <meshStandardMaterial color={leaf} emissive={leaf} emissiveIntensity={0.28} roughness={0.55} />
      </mesh>
      <mesh position={[-lean * 0.8, 0.72, 0.04]} raycast={() => null}>
        <sphereGeometry args={[0.18, 14, 10]} />
        <meshStandardMaterial color={leaf} emissive={leaf} emissiveIntensity={0.18} roughness={0.52} />
      </mesh>
      <mesh position={[lean * 0.4, 0.86, 0]} raycast={() => null}>
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshStandardMaterial color={crown} emissive={crown} emissiveIntensity={0.4} roughness={0.42} />
      </mesh>
    </group>
  );
}

/** Blue and white trees planted on each building footprint. */
export function Trees() {
  return (
    <group name="trees">
      {PLANTINGS.map((planting) => (
        <group key={planting.id} position={[planting.x, 0, planting.z]} scale={planting.scale}>
          <Canopy whiteCanopy={planting.whiteCanopy} lean={planting.lean} />
        </group>
      ))}
    </group>
  );
}
