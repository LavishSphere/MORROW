import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OPENING_DESCEND_MS, OPENING_REDUCED_DESCEND_MS } from "../../brand/OpeningSequence";

type CameraRigProps = {
  reducedMotion: boolean;
  /** Fired by OpeningSequence when the lockup starts fading. */
  descendSignal: { durationMs: number; token: number } | null;
  lookAt?: readonly [number, number, number];
  span?: number;
};

function smoothstep(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/**
 * Opening camera: high overview → settled miniature orbit.
 * With reduced motion, cuts straight to the settled view.
 */
export function CameraRig({
  reducedMotion,
  descendSignal,
  lookAt = [0, 0.4, 0],
  span = 16,
}: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const look = useMemo(
    () => new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]),
    [lookAt],
  );
  const start = useMemo(
    () => new THREE.Vector3(span * 0.15, span * 1.35, span * 1.05),
    [span],
  );
  const mid = useMemo(
    () => new THREE.Vector3(span * 0.55, span * 0.72, span * 0.7),
    [span],
  );
  const end = useMemo(
    () => new THREE.Vector3(span * 0.42, span * 0.48, span * 0.62),
    [span],
  );
  const fromMid = useMemo(() => new THREE.Vector3(), []);
  const toEnd = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const progress = useRef(reducedMotion ? 1 : 0);
  const durationSec = useRef(
    (reducedMotion ? OPENING_REDUCED_DESCEND_MS : OPENING_DESCEND_MS) / 1000,
  );
  const descending = useRef(false);
  const [orbitReady, setOrbitReady] = useState(reducedMotion);
  const signalToken = descendSignal?.token ?? 0;
  const signalDuration = descendSignal?.durationMs;

  useLayoutEffect(() => {
    progress.current = reducedMotion ? 1 : 0;
    descending.current = false;
    camera.position.copy(reducedMotion ? end : start);
    camera.lookAt(look);
    setOrbitReady(reducedMotion);
  }, [camera, reducedMotion, start, end, look]);

  useLayoutEffect(() => {
    if (signalDuration === undefined) return;
    if (reducedMotion || signalDuration <= 0) {
      progress.current = 1;
      descending.current = false;
      camera.position.copy(end);
      camera.lookAt(look);
      setOrbitReady(true);
      return;
    }
    durationSec.current = Math.max(0.2, signalDuration / 1000);
    progress.current = 0;
    descending.current = true;
    setOrbitReady(false);
    camera.position.copy(start);
    camera.lookAt(look);
  }, [signalToken, signalDuration, reducedMotion, camera, start, end, look]);

  useFrame((_, delta) => {
    if (!descending.current || progress.current >= 1) return;
    progress.current = Math.min(
      1,
      progress.current + Math.min(delta, 0.05) / durationSec.current,
    );
    const t = smoothstep(progress.current);
    fromMid.copy(start).lerp(mid, t);
    toEnd.copy(mid).lerp(end, t);
    position.copy(fromMid).lerp(toEnd, t);
    camera.position.copy(position);
    camera.lookAt(look);
    if (progress.current >= 1) {
      descending.current = false;
      setOrbitReady(true);
    }
  });

  return (
    <OrbitControls
      enabled={orbitReady}
      enablePan={false}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      minDistance={span * 0.35}
      maxDistance={span * 1.6}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI * 0.48}
      target={[look.x, look.y, look.z]}
    />
  );
}
