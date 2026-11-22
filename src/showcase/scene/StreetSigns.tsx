import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState } from "react";
import type * as THREE from "three";

export type SignSpot = { name: string; x: number; z: number };

/** Signs appear once the camera is this close to what it looks at. */
const ZOOMED_IN = 40;
/** Only signs this near the view center, nearest first, at most MAX. */
const RADIUS = 24;
const MAX = 12;

/**
 * Minimal street signs: a slim post with the street name, on nearby streets
 * only, and only when zoomed in. Checked a few times a second, not per frame.
 */
export function StreetSigns({ signs }: { signs: readonly SignSpot[] }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as {
    target: THREE.Vector3;
  } | null;
  const [visible, setVisible] = useState<SignSpot[]>([]);
  const lastCheck = useRef(0);
  const lastKey = useRef("");

  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastCheck.current < 0.25) return;
    lastCheck.current = clock.elapsedTime;
    const target = controls?.target;
    if (!target) return;
    let next: SignSpot[] = [];
    if (camera.position.distanceTo(target) < ZOOMED_IN) {
      next = signs
        .map((sign) => ({ sign, d: Math.hypot(sign.x - target.x, sign.z - target.z) }))
        .filter((entry) => entry.d < RADIUS)
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX)
        .map((entry) => entry.sign);
    }
    const key = next.map((s) => `${s.name}@${s.x.toFixed(1)}`).join("|");
    if (key !== lastKey.current) {
      lastKey.current = key;
      setVisible(next);
    }
  });

  return (
    <group name="street-signs">
      {visible.map((sign) => (
        <group key={`${sign.name}@${sign.x.toFixed(1)},${sign.z.toFixed(1)}`} position={[sign.x, 0, sign.z]}>
          <mesh position={[0, 0.55, 0]} castShadow raycast={() => null}>
            <cylinderGeometry args={[0.018, 0.022, 1.1, 6]} />
            <meshStandardMaterial color="#c9d0d4" metalness={0.6} roughness={0.35} />
          </mesh>
          <Html position={[0, 1.2, 0]} center distanceFactor={9} zIndexRange={[4, 0]}>
            <div className="street-sign">{sign.name}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}
