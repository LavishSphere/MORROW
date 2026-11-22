import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { polylineLength } from "../../data/rail.ts";
import type { LiveVehicle } from "../../data/transitLive.ts";
import {
  alongAt,
  CAR_LENGTH,
  consistPoses,
  consistSize,
  placeLiveVehicles,
  retarget,
  type Motion,
  type TrackLine,
} from "../../data/trains.ts";
import { bridgeLift, RAIL_Y } from "./railGeometry";

/** Most cars drawn at once. */
const MAX_CARS = 240;
const CAR_WIDTH = 0.36;
const CAR_HEIGHT = 0.36;
/** Underground trains float just over the dashed tunnel line, as a ghost. */
const GHOST_Y = 0.1;

type Props = {
  lines: readonly TrackLine[];
  project: (lon: number, lat: number) => readonly [number, number];
  live: readonly LiveVehicle[];
  /** When the live vehicles arrived (ms); a new value starts new glides. */
  liveAt: number;
  pollMs: number;
  reducedMotion: boolean;
};

/** One instanced mesh with per-car colour and room for MAX_CARS. */
function CarMesh({
  meshRef,
  geometry,
  material,
}: {
  meshRef: RefObject<THREE.InstancedMesh | null>;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const colors = useMemo(() => new Float32Array(MAX_CARS * 3).fill(1), []);
  return (
    <instancedMesh ref={meshRef} args={[geometry, material, MAX_CARS]} count={0} frustumCulled={false} raycast={() => null}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}

/**
 * Train cars in line colours. Surface trains run on the track; underground
 * trains are a translucent ghost over the tunnel line. Live vehicles glide
 * from one reported spot to the next over a poll interval.
 */
export function Trains({ lines, project, live, liveAt, pollMs, reducedMotion }: Props) {
  const parts = useMemo(() => {
    const body = new THREE.BoxGeometry(CAR_LENGTH, CAR_HEIGHT, CAR_WIDTH).translate(0, CAR_HEIGHT / 2 + 0.02, 0);
    const windows = new THREE.BoxGeometry(CAR_LENGTH * 0.9, 0.08, CAR_WIDTH + 0.012).translate(0, CAR_HEIGHT * 0.7, 0);
    return {
      body,
      windows,
      paint: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 }),
      glass: new THREE.MeshStandardMaterial({ color: "#1c2830", roughness: 0.15, metalness: 0.6 }),
      ghost: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false }),
    };
  }, []);
  useEffect(
    () => () => {
      for (const item of Object.values(parts)) item.dispose();
    },
    [parts],
  );
  const surface = useRef<THREE.InstancedMesh>(null);
  const windows = useRef<THREE.InstancedMesh>(null);
  const ghost = useRef<THREE.InstancedMesh>(null);
  const lengths = useMemo(() => lines.map((line) => polylineLength(line.points)), [lines]);

  const targets = useMemo(() => placeLiveVehicles(live, lines, project), [live, lines, project]);
  const motions = useRef<Map<string, Motion>>(new Map());
  useEffect(() => {
    motions.current = retarget(motions.current, targets, performance.now(), pollMs, reducedMotion);
  }, [targets, liveAt, pollMs, reducedMotion]);

  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      p: new THREE.Vector3(),
      one: new THREE.Vector3(1, 1, 1),
      up: new THREE.Vector3(0, 1, 0),
      colour: new THREE.Color(),
    }),
    [],
  );

  useFrame(() => {
    const top = surface.current;
    const glass = windows.current;
    const under = ghost.current;
    if (!top || !glass || !under) return;
    const now = performance.now();
    let above = 0;
    let below = 0;
    const { matrix, q, p, one, up, colour } = scratch;
    for (const motion of motions.current.values()) {
      const line = lines[motion.line];
      if (!line) continue;
      const along = alongAt(motion, now);
      colour.set(motion.colour);
      for (const car of consistPoses(line.points, along, motion.dir, consistSize(line.railway))) {
        q.setFromAxisAngle(up, Math.atan2(-car.dz, car.dx));
        if (line.underground) {
          if (below >= MAX_CARS) continue;
          matrix.compose(p.set(car.x, GHOST_Y, car.z), q, one);
          under.setMatrixAt(below, matrix);
          under.setColorAt(below, colour);
          below += 1;
        } else {
          if (above >= MAX_CARS) continue;
          const lift = line.bridge ? bridgeLift(car.along, lengths[motion.line] ?? 0) : 0;
          matrix.compose(p.set(car.x, lift + RAIL_Y, car.z), q, one);
          top.setMatrixAt(above, matrix);
          top.setColorAt(above, colour);
          glass.setMatrixAt(above, matrix);
          above += 1;
        }
      }
    }
    top.count = above;
    glass.count = above;
    under.count = below;
    for (const mesh of [top, glass, under]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group name="trains">
      <CarMesh meshRef={surface} geometry={parts.body} material={parts.paint} />
      <CarMesh meshRef={windows} geometry={parts.windows} material={parts.glass} />
      <CarMesh meshRef={ghost} geometry={parts.body} material={parts.ghost} />
    </group>
  );
}
