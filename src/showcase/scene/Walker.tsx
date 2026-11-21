import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { CURB_POSITION, CURB_SIZE } from "../layout";
import { Surface } from "../materials";
import { scene } from "../palette";
import { COLLIDERS, SPAWN, WALK_LIMIT, overlaps, surfaceY, type Obstacle } from "./cityData";

const RADIUS = 0.42;
/** Resting third-person rig: behind the feet, above them, looking down the street. */
const CHASE_BACK = 4.2;
const CHASE_UP = 1.7;
const LOOK_AHEAD = 2.2;
const CHEST = 1.35;
/** Street-level settle only. Never the aerial canvas pose. */
const EASE_SECONDS = 0.85;
const EASE_EXTRA_BACK = 0.5;
const EASE_EXTRA_UP = 0.65;

function blocked(x: number, z: number, extra: readonly Obstacle[]) {
  if (Math.abs(x) > WALK_LIMIT || Math.abs(z) > WALK_LIMIT) return true;
  for (const box of COLLIDERS) {
    if (overlaps(x, z, box, RADIUS)) return true;
  }
  for (const box of extra) {
    if (overlaps(x, z, box, RADIUS)) return true;
  }
  return false;
}

function placeCamera(
  yaw: number,
  x: number,
  feetY: number,
  z: number,
  lift: number,
  cam: THREE.Vector3,
  look: THREE.Vector3,
) {
  const forwardX = -Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const back = CHASE_BACK + lift * EASE_EXTRA_BACK;
  const up = CHASE_UP + lift * EASE_EXTRA_UP;
  cam.set(x - forwardX * back, feetY + up, z - forwardZ * back);
  look.set(x + forwardX * LOOK_AHEAD, feetY + CHEST, z + forwardZ * LOOK_AHEAD);
}

function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function Walker({
  reducedMotion,
  rampOpen,
}: {
  reducedMotion: boolean;
  rampOpen: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const player = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const keys = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    turnLeft: false,
    turnRight: false,
    run: false,
  });
  const yaw = useRef(SPAWN.yaw);
  const place = useRef({ x: SPAWN.x, z: SPAWN.z, travel: 0 });
  const look = useRef(new THREE.Vector3());
  const ease = useRef(reducedMotion ? EASE_SECONDS : 0);

  useLayoutEffect(() => {
    const feetY = surfaceY(place.current.x, place.current.z);
    placeCamera(
      yaw.current,
      place.current.x,
      feetY,
      place.current.z,
      reducedMotion ? 0 : 1,
      camera.position,
      look.current,
    );
    camera.lookAt(look.current);
  }, [camera, reducedMotion]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "KeyW" || event.code === "ArrowUp") keys.current.forward = true;
      if (event.code === "KeyS" || event.code === "ArrowDown") keys.current.back = true;
      if (event.code === "KeyA") keys.current.left = true;
      if (event.code === "KeyD") keys.current.right = true;
      if (event.code === "ArrowLeft") keys.current.turnLeft = true;
      if (event.code === "ArrowRight") keys.current.turnRight = true;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") keys.current.run = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "KeyW" || event.code === "ArrowUp") keys.current.forward = false;
      if (event.code === "KeyS" || event.code === "ArrowDown") keys.current.back = false;
      if (event.code === "KeyA") keys.current.left = false;
      if (event.code === "KeyD") keys.current.right = false;
      if (event.code === "ArrowLeft") keys.current.turnLeft = false;
      if (event.code === "ArrowRight") keys.current.turnRight = false;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") keys.current.run = false;
    };
    const lookWithMouse = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= event.movementX * 0.0022;
    };
    const lock = () => {
      if (document.pointerLockElement !== gl.domElement) {
        void gl.domElement.requestPointerLock();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", lookWithMouse);
    gl.domElement.addEventListener("click", lock);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", lookWithMouse);
      gl.domElement.removeEventListener("click", lock);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    if (keys.current.turnLeft) yaw.current += step * 1.7;
    if (keys.current.turnRight) yaw.current -= step * 1.7;
    const forwardX = -Math.sin(yaw.current);
    const forwardZ = Math.cos(yaw.current);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const inputZ = (keys.current.forward ? 1 : 0) - (keys.current.back ? 1 : 0);
    const inputX = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
    const length = Math.hypot(inputX, inputZ) || 1;
    const speed = (keys.current.run ? 8.2 : 4.1) * (inputX === 0 && inputZ === 0 ? 0 : 1);
    const vx = ((forwardX * inputZ + rightX * inputX) / length) * speed;
    const vz = ((forwardZ * inputZ + rightZ * inputX) / length) * speed;
    const curb: Obstacle[] = rampOpen
      ? []
      : [
          {
            x: CURB_POSITION[0],
            z: CURB_POSITION[2],
            w: CURB_SIZE[0] + 0.2,
            d: CURB_SIZE[2],
          },
        ];
    const nextX = place.current.x + vx * step;
    const nextZ = place.current.z + vz * step;
    if (!blocked(nextX, place.current.z, curb)) place.current.x = nextX;
    if (!blocked(place.current.x, nextZ, curb)) place.current.z = nextZ;
    place.current.travel += Math.hypot(vx, vz) * step;

    const y = surfaceY(place.current.x, place.current.z);
    if (player.current) {
      player.current.position.set(place.current.x, y, place.current.z);
      player.current.rotation.y = yaw.current;
      const moving = keys.current.forward || keys.current.back || keys.current.left || keys.current.right;
      const swing = moving ? Math.sin(place.current.travel * 7) * 0.7 : 0;
      if (leftLeg.current) leftLeg.current.rotation.x = swing;
      if (rightLeg.current) rightLeg.current.rotation.x = -swing;
      if (leftArm.current) leftArm.current.rotation.x = -swing * 0.7;
      if (rightArm.current) rightArm.current.rotation.x = swing * 0.7;
    }

    const lift = reducedMotion ? 0 : 1 - smoothstep(ease.current / EASE_SECONDS);
    placeCamera(yaw.current, place.current.x, y, place.current.z, lift, camera.position, look.current);
    camera.lookAt(look.current);
    if (!reducedMotion && ease.current < EASE_SECONDS) {
      ease.current = Math.min(EASE_SECONDS, ease.current + step);
    }
  });

  return (
    <group ref={player} position={[SPAWN.x, surfaceY(SPAWN.x, SPAWN.z), SPAWN.z]}>
      <mesh castShadow position={[0, 1.24, 0]}>
        <capsuleGeometry args={[0.22, 0.48, 16, 24]} />
        <Surface color="#c4553a" roughness={0.74} />
      </mesh>
      <mesh castShadow position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.16, 32, 24]} />
        <Surface color={scene.skin} roughness={0.62} />
      </mesh>
      <group ref={leftArm} position={[-0.26, 1.42, 0]}>
        <mesh castShadow position={[0, -0.35, 0]}>
          <capsuleGeometry args={[0.065, 0.57, 16, 16]} />
          <Surface color="#c4553a" roughness={0.74} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.26, 1.42, 0]}>
        <mesh castShadow position={[0, -0.35, 0]}>
          <capsuleGeometry args={[0.065, 0.57, 16, 16]} />
          <Surface color="#c4553a" roughness={0.74} />
        </mesh>
      </group>
      <group ref={leftLeg} position={[-0.11, 0.92, 0]}>
        <mesh castShadow position={[0, -0.4, 0]}>
          <capsuleGeometry args={[0.09, 0.52, 16, 16]} />
          <Surface color={scene.jeans} roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, -0.82, 0.05]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <Surface color={scene.shoes} roughness={0.58} metalness={0.06} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.11, 0.92, 0]}>
        <mesh castShadow position={[0, -0.4, 0]}>
          <capsuleGeometry args={[0.09, 0.52, 16, 16]} />
          <Surface color={scene.jeans} roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, -0.82, 0.05]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <Surface color={scene.shoes} roughness={0.58} metalness={0.06} />
        </mesh>
      </group>
    </group>
  );
}
