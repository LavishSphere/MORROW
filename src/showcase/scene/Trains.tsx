import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { polylineLength, similarColour } from "../../data/rail.ts";
import { consistFront, segmentAt, simPosition, type RailRoute, type SimTrain } from "../../data/railRoutes.ts";
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

/** Most cars drawn at once, per mesh: live and simulated together. */
const MAX_CARS = 480;
/** Simulated trains move only within this distance of the view center. */
const NEAR = 110;
const CAR_WIDTH = 0.36;
const CAR_HEIGHT = 0.36;
/** Underground trains float just over the dashed tunnel line, as a ghost. */
const GHOST_Y = 0.1;
/** With reduced motion, standing trains are redrawn once the view center moves this far. */
const STILL_STEP = 4;

type Props = {
  lines: readonly TrackLine[];
  project: (lon: number, lat: number) => readonly [number, number];
  /** Stitched routes and the simulated trains that run on them. */
  routes: readonly RailRoute[];
  sim: readonly SimTrain[];
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
 * from one reported spot to the next over a poll interval. Everywhere
 * else, and on lines a live feed does not cover, simulated trains run a
 * seeded timetable; they move only near the view, and stand still with
 * reduced motion.
 */
export function Trains({ lines, routes, sim, project, live, liveAt, pollMs, reducedMotion }: Props) {
  const controls = useThree((state) => state.controls) as unknown as { target: THREE.Vector3 } | null;
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
  // Live vehicles replace simulated trains on the lines they cover.
  const simulated = useMemo(() => {
    const liveColours = [...new Set(targets.map((t) => t.colour))];
    return sim.filter((train) => {
      const route = routes[train.route];
      return route && !liveColours.some((colour) => similarColour(colour, route.colour));
    });
  }, [sim, routes, targets]);
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

  // With reduced motion nothing moves: redraw only when the trains or the
  // view center (which decides the nearby simulated trains) change.
  const still = useRef({ motions: null as Map<string, Motion> | null, simulated: null as readonly SimTrain[] | null, x: NaN, z: NaN });

  useFrame(({ clock }) => {
    const top = surface.current;
    const glass = windows.current;
    const under = ghost.current;
    if (!top || !glass || !under) return;
    if (reducedMotion) {
      const memo = still.current;
      const at = controls?.target;
      const moved = !at || !(Math.hypot(at.x - memo.x, at.z - memo.z) < STILL_STEP);
      if (memo.motions === motions.current && memo.simulated === simulated && !moved) return;
      memo.motions = motions.current;
      memo.simulated = simulated;
      memo.x = at?.x ?? NaN;
      memo.z = at?.z ?? NaN;
    } else {
      still.current.motions = null;
    }
    const now = performance.now();
    let above = 0;
    let below = 0;
    const { matrix, q, p, one, up, colour } = scratch;
    /** One car: on the track, or a ghost over the tunnel line. */
    const draw = (x: number, z: number, dx: number, dz: number, underground: boolean, lift: number) => {
      q.setFromAxisAngle(up, Math.atan2(-dz, dx));
      if (underground) {
        if (below >= MAX_CARS) return;
        matrix.compose(p.set(x, GHOST_Y, z), q, one);
        under.setMatrixAt(below, matrix);
        under.setColorAt(below, colour);
        below += 1;
      } else {
        if (above >= MAX_CARS) return;
        matrix.compose(p.set(x, lift + RAIL_Y, z), q, one);
        top.setMatrixAt(above, matrix);
        top.setColorAt(above, colour);
        glass.setMatrixAt(above, matrix);
        above += 1;
      }
    };
    for (const motion of motions.current.values()) {
      const line = lines[motion.line];
      if (!line) continue;
      const along = alongAt(motion, now);
      colour.set(motion.colour);
      for (const car of consistPoses(line.points, along, motion.dir, consistSize(line.railway))) {
        const lift = line.bridge ? bridgeLift(car.along, lengths[motion.line] ?? 0) : 0;
        draw(car.x, car.z, car.dx, car.dz, line.underground, lift);
      }
    }
    const target = controls?.target;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    for (const train of simulated) {
      const route = routes[train.route];
      if (!route || !target) continue;
      const { bbox } = route;
      if (target.x < bbox.minX - NEAR || target.x > bbox.maxX + NEAR || target.z < bbox.minZ - NEAR || target.z > bbox.maxZ + NEAR) continue;
      const { along, dir } = simPosition(route, train, t);
      const front = consistFront(along, dir, route.length, train.cars);
      const cars = consistPoses(route.points, front, dir, train.cars);
      const lead = cars[0];
      if (!lead || Math.hypot(lead.x - target.x, lead.z - target.z) > NEAR) continue;
      colour.set(route.colour);
      for (const car of cars) {
        const segment = segmentAt(route, car.along);
        const line = segment ? lines[segment.line] : undefined;
        const lift = line?.bridge && segment ? bridgeLift(car.along - segment.start, segment.end - segment.start) : 0;
        draw(car.x, car.z, car.dx, car.dz, line?.underground ?? false, lift);
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
