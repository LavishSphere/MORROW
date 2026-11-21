import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { INTRO, INTRO_MOVE_START } from "../timing";

const START = new THREE.Vector3(13.2, -1.1, 12.4);
const MID = new THREE.Vector3(6.5, 8.6, 12.8);
const END = new THREE.Vector3(0.2, 5.6, 11.4);
const LOOK = new THREE.Vector3(0.15, 0.35, 0.1);

function smoothstep(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((state) => state.camera);
  const elapsed = useRef(reducedMotion ? INTRO_MOVE_START + INTRO.move : 0);
  const [arrived, setArrived] = useState(reducedMotion);
  const fromMid = useMemo(() => new THREE.Vector3(), []);
  const toEnd = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    elapsed.current = reducedMotion ? INTRO_MOVE_START + INTRO.move : 0;
    setArrived(reducedMotion);
    camera.position.copy(reducedMotion ? END : START);
    camera.lookAt(LOOK);
  }, [camera, reducedMotion]);

  useFrame((_, delta) => {
    if (reducedMotion || elapsed.current >= INTRO_MOVE_START + INTRO.move) return;
    elapsed.current = Math.min(INTRO_MOVE_START + INTRO.move, elapsed.current + Math.min(delta, 0.05));
    const progress = smoothstep((elapsed.current - INTRO_MOVE_START) / INTRO.move);
    fromMid.copy(START).lerp(MID, progress);
    toEnd.copy(MID).lerp(END, progress);
    position.copy(fromMid).lerp(toEnd, progress);
    camera.position.copy(position);
    camera.lookAt(LOOK);
    if (elapsed.current >= INTRO_MOVE_START + INTRO.move) setArrived(true);
  });

  if (!arrived) return null;

  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={7.4}
      maxDistance={22}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI * 0.86}
      target={[LOOK.x, LOOK.y, LOOK.z]}
    />
  );
}
