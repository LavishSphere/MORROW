import { useEffect, useMemo } from "react";
import { ToonMaterial } from "../materials";
import { LOGO_BLUE, scene } from "../palette";
import { GRASS_Y } from "../layout";
import { FacetGeometry } from "./FacetGeometry";
import { createGableGeometry } from "./geometries";

type Front = "east" | "west";

type BuildingSpec = {
  center: readonly [number, number];
  footprint: readonly [number, number];
  height: number;
  front: Front;
  wall: string;
  roof: string;
  roofHeight: number;
  chimney?: boolean;
  tower?: boolean;
  awning?: boolean;
};

const BUILDINGS: readonly BuildingSpec[] = [
  {
    center: [-3.45, -2.25],
    footprint: [1.4, 1.2],
    height: 1.2,
    front: "east",
    wall: scene.wallCream,
    roof: scene.roofRed,
    roofHeight: 0.55,
    chimney: true,
  },
  {
    center: [-3.65, 0.2],
    footprint: [1.5, 1.35],
    height: 1.45,
    front: "east",
    wall: scene.wallWhite,
    roof: scene.roofSlate,
    roofHeight: 0.62,
  },
  {
    center: [-3.3, 2.5],
    footprint: [1.3, 1.15],
    height: 1.05,
    front: "east",
    wall: scene.wallSand,
    roof: scene.roofBrown,
    roofHeight: 0.48,
    chimney: true,
  },
  {
    center: [3.55, -1.65],
    footprint: [1.9, 1.6],
    height: 1.65,
    front: "west",
    wall: scene.wallCream,
    roof: scene.roofSlate,
    roofHeight: 0.58,
    tower: true,
  },
  {
    center: [3.4, 1.25],
    footprint: [1.35, 1.2],
    height: 1.25,
    front: "west",
    wall: scene.wallWhite,
    roof: scene.roofRed,
    roofHeight: 0.52,
  },
  {
    center: [3.2, 3.15],
    footprint: [1.45, 1.1],
    height: 1.1,
    front: "west",
    wall: scene.wallSand,
    roof: scene.roofBrown,
    roofHeight: 0.42,
    awning: true,
  },
];

const TREES: readonly (readonly [number, number, number])[] = [
  [-5.05, 0.95, -0.35],
  [-4.55, 1.15, -3.85],
  [-2.35, 0.8, -4.45],
  [2.15, 1.05, -4.35],
  [5.35, 1.2, -1.45],
  [5.15, 0.85, 1.85],
  [1.55, 0.9, 4.75],
  [-2.05, 1.1, 4.15],
  [-4.35, 0.75, 3.55],
];

function House({ spec }: { spec: BuildingSpec }) {
  const { center, footprint, height, front, wall, roof, roofHeight, chimney, tower, awning } = spec;
  const [width, depth] = footprint;
  const frontSign = front === "east" ? 1 : -1;
  const facade = frontSign * (width / 2 + 0.03);
  const roofGeometry = useMemo(
    () => createGableGeometry(width + 0.22, depth + 0.16, roofHeight),
    [width, depth, roofHeight],
  );

  useEffect(() => () => roofGeometry.dispose(), [roofGeometry]);

  const windowCount = depth > 1.5 ? 3 : 2;
  const windowZ = Array.from({ length: windowCount }, (_, index) => {
    return (index - (windowCount - 1) / 2) * depth * 0.34;
  }).filter((z) => Math.abs(z) > 0.14);

  return (
    <group position={[center[0], GRASS_Y, center[1]]}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <ToonMaterial color={wall} />
      </mesh>
      <mesh geometry={roofGeometry} position={[0, height, 0]}>
        <ToonMaterial color={roof} />
      </mesh>
      <mesh position={[facade, 0.28, 0]}>
        <boxGeometry args={[0.06, 0.52, 0.28]} />
        <ToonMaterial color={scene.door} />
      </mesh>
      <mesh position={[frontSign * (width / 2 + 0.1), 0.06, 0]}>
        <boxGeometry args={[0.18, 0.12, 0.48]} />
        <ToonMaterial color={scene.stone} />
      </mesh>
      {windowZ.map((z) => (
        <mesh key={`low-${z}`} position={[facade, height * 0.58, z]}>
          <boxGeometry args={[0.05, 0.18, 0.16]} />
          <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
        </mesh>
      ))}
      {height >= 1.45 &&
        windowZ.map((z) => (
          <mesh key={`high-${z}`} position={[facade, height * 0.8, z]}>
            <boxGeometry args={[0.05, 0.16, 0.14]} />
            <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
          </mesh>
        ))}
      {chimney && (
        <mesh position={[width * 0.22, height + roofHeight * 0.42, -depth * 0.18]}>
          <boxGeometry args={[0.18, 0.4, 0.18]} />
          <ToonMaterial color={scene.stoneDark} />
        </mesh>
      )}
      {tower && (
        <group position={[0, height, 0]}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.52, 1.1, 0.52]} />
            <ToonMaterial color={wall} />
          </mesh>
          <mesh position={[frontSign * 0.27, 0.62, 0]}>
            <boxGeometry args={[0.04, 0.18, 0.14]} />
            <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
          </mesh>
          <mesh position={[0, 1.22, 0]}>
            <FacetGeometry kind="cone" args={[0.4, 0.48, 4]} />
            <ToonMaterial color={roof} />
          </mesh>
        </group>
      )}
      {awning && (
        <mesh position={[frontSign * (width / 2 + 0.2), height * 0.46, 0]}>
          <boxGeometry args={[0.38, 0.07, depth * 0.72]} />
          <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Tree({ position }: { position: readonly [number, number, number] }) {
  const [x, scale, z] = position;
  return (
    <group position={[x, GRASS_Y, z]} scale={scale}>
      <mesh position={[0, 0.32, 0]}>
        <FacetGeometry kind="cylinder" args={[0.07, 0.11, 0.64, 5]} />
        <ToonMaterial color={scene.trunk} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <FacetGeometry kind="cone" args={[0.42, 0.64, 6]} />
        <ToonMaterial color={scene.leaf} />
      </mesh>
      <mesh position={[0, 1.18, 0]}>
        <FacetGeometry kind="cone" args={[0.28, 0.48, 5]} />
        <ToonMaterial color={scene.leafLight} />
      </mesh>
    </group>
  );
}

export function Buildings() {
  return (
    <group>
      {BUILDINGS.map((spec) => (
        <House key={`${spec.center[0]}-${spec.center[1]}`} spec={spec} />
      ))}
      {TREES.map((position) => (
        <Tree key={`${position[0]}-${position[2]}`} position={position} />
      ))}
    </group>
  );
}
