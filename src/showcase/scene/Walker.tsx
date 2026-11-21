import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CURB_POSITION, CURB_SIZE } from "../layout";
import { COLLIDERS, SPAWN, WALK_LIMIT, overlaps, surfaceY, type Obstacle } from "./cityData";

const RADIUS = 0.35;
const EYE = 1.62;

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

/** Eye-level street view. Yaw 0 faces +Z. Pitch is look up/down. */
function lookDirection(yaw: number, pitch: number, out: THREE.Vector3) {
  const cosPitch = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch);
  return out;
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
  const keys = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
  });
  const yaw = useRef(SPAWN.yaw);
  const pitch = useRef(-0.22);
  const place = useRef({ x: SPAWN.x, z: SPAWN.z });
  const direction = useRef(new THREE.Vector3());

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "KeyW" || event.code === "ArrowUp") keys.current.forward = true;
      if (event.code === "KeyS" || event.code === "ArrowDown") keys.current.back = true;
      if (event.code === "KeyA" || event.code === "ArrowLeft") keys.current.left = true;
      if (event.code === "KeyD" || event.code === "ArrowRight") keys.current.right = true;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") keys.current.run = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "KeyW" || event.code === "ArrowUp") keys.current.forward = false;
      if (event.code === "KeyS" || event.code === "ArrowDown") keys.current.back = false;
      if (event.code === "KeyA" || event.code === "ArrowLeft") keys.current.left = false;
      if (event.code === "KeyD" || event.code === "ArrowRight") keys.current.right = false;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") keys.current.run = false;
    };
    const lookWithMouse = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= event.movementX * 0.0022;
      const next = pitch.current - event.movementY * 0.002;
      pitch.current = Math.min(0.95, Math.max(-1.15, next));
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
    const forwardX = -Math.sin(yaw.current);
    const forwardZ = Math.cos(yaw.current);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const inputZ = (keys.current.forward ? 1 : 0) - (keys.current.back ? 1 : 0);
    const inputX = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
    const length = Math.hypot(inputX, inputZ) || 1;
    const moving = inputX !== 0 || inputZ !== 0;
    const speed = (keys.current.run ? 3.4 : 1.45) * (moving ? 1 : 0);
    const vx = ((forwardX * inputZ + rightX * inputX) / length) * speed;
    const vz = ((forwardZ * inputZ + rightZ * inputX) / length) * speed;
    const curb: Obstacle[] = rampOpen
      ? []
      : [
          {
            x: CURB_POSITION[0],
            z: CURB_POSITION[2],
            w: CURB_SIZE[0] + 0.15,
            d: CURB_SIZE[2],
          },
        ];
    const nextX = place.current.x + vx * step;
    const nextZ = place.current.z + vz * step;
    if (!blocked(nextX, place.current.z, curb)) place.current.x = nextX;
    if (!blocked(place.current.x, nextZ, curb)) place.current.z = nextZ;

    const feet = surfaceY(place.current.x, place.current.z);
    const bob = reducedMotion || !moving ? 0 : Math.sin(performance.now() * 0.008) * 0.025;
    const eyeY = feet + EYE + bob;
    lookDirection(yaw.current, pitch.current, direction.current);
    camera.position.set(place.current.x, eyeY, place.current.z);
    camera.lookAt(
      place.current.x + direction.current.x,
      eyeY + direction.current.y,
      place.current.z + direction.current.z,
    );
  });

  return null;
}
