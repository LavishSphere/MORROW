import { useMemo } from "react";
import * as THREE from "three";
import { FIX_SPOTS, surfaceY } from "./cityData";

const MARK = new THREE.Shape();
MARK.moveTo(0, 0.9);
MARK.lineTo(0.55, -0.15);
MARK.lineTo(0.18, -0.15);
MARK.lineTo(0.18, -0.7);
MARK.lineTo(-0.18, -0.7);
MARK.lineTo(-0.18, -0.15);
MARK.lineTo(-0.55, -0.15);
MARK.closePath();

const AHEAD = 6.5;

/** Blue ground arrow toward the next place that can be fixed. Click it to travel. */
export function FixMarks({
  activeIndex,
  onActivate,
}: {
  activeIndex: number;
  onActivate?: (index: number) => void;
}) {
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(MARK, { depth: 0.12, bevelEnabled: false }),
    [],
  );
  const spot = FIX_SPOTS[activeIndex] ?? FIX_SPOTS[0];
  const next = (activeIndex + 1) % FIX_SPOTS.length;
  const x = spot.x - Math.sin(spot.yaw) * AHEAD;
  const z = spot.z + Math.cos(spot.yaw) * AHEAD;

  if (!onActivate) return null;

  return (
    <mesh
      geometry={geometry}
      position={[x, surfaceY(x, z) + 0.06, z]}
      rotation={[-Math.PI / 2, spot.yaw, 0]}
      scale={2.4}
      onClick={(event) => {
        event.stopPropagation();
        onActivate(next);
      }}
    >
      <meshBasicMaterial color="#1488ff" />
    </mesh>
  );
}
