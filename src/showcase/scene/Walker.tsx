import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CURB_POSITION, CURB_SIZE } from "../layout";
import {
  COLLIDERS,
  SPAWN,
  WALK_LIMIT,
  onStreet,
  overlaps,
  surfaceY,
  type Obstacle,
} from "./cityData";

const RADIUS = 0.32;
const EYE = 1.62;
const MIN_FOV = 42;
const MAX_FOV = 92;

function blocked(x: number, z: number, extra: readonly Obstacle[]) {
  if (Math.abs(x) > WALK_LIMIT || Math.abs(z) > WALK_LIMIT) return true;
  if (!onStreet(x, z)) return true;
  for (const box of COLLIDERS) {
    if (overlaps(x, z, box, RADIUS)) return true;
  }
  for (const box of extra) {
    if (overlaps(x, z, box, RADIUS)) return true;
  }
  return false;
}

function lookDirection(yaw: number, pitch: number, out: THREE.Vector3) {
  const cosPitch = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch);
  return out;
}

function damp(current: number, target: number, lambda: number, step: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * step));
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
  const pitch = useRef(-0.16);
  const place = useRef({ x: SPAWN.x, z: SPAWN.z });
  const velocity = useRef({ x: 0, z: 0 });
  const eye = useRef(surfaceY(SPAWN.x, SPAWN.z) + EYE);
  const fov = useRef(72);
  const fovTarget = useRef(72);
  const direction = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());
  const desiredLook = useRef(new THREE.Vector3());

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
      const glide = reducedMotion ? 1 : 0.65;
      yaw.current -= event.movementX * 0.002 * glide;
      const next = pitch.current - event.movementY * 0.0018 * glide;
      pitch.current = Math.min(0.85, Math.max(-1.05, next));
    };
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      const next = fovTarget.current + event.deltaY * 0.035;
      fovTarget.current = Math.min(MAX_FOV, Math.max(MIN_FOV, next));
    };
    const lock = () => {
      if (document.pointerLockElement !== gl.domElement) {
        void gl.domElement.requestPointerLock();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", lookWithMouse);
    gl.domElement.addEventListener("wheel", zoom, { passive: false });
    gl.domElement.addEventListener("click", lock);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", lookWithMouse);
      gl.domElement.removeEventListener("wheel", zoom);
      gl.domElement.removeEventListener("click", lock);
    };
  }, [gl, reducedMotion]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    const glide = reducedMotion ? 16 : 3.2;
    const forwardX = -Math.sin(yaw.current);
    const forwardZ = Math.cos(yaw.current);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const inputZ = (keys.current.forward ? 1 : 0) - (keys.current.back ? 1 : 0);
    const inputX = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
    const length = Math.hypot(inputX, inputZ) || 1;
    const moving = inputX !== 0 || inputZ !== 0;
    const speed = keys.current.run ? 3.1 : 1.35;
    const targetX = moving ? ((forwardX * inputZ + rightX * inputX) / length) * speed : 0;
    const targetZ = moving ? ((forwardZ * inputZ + rightZ * inputX) / length) * speed : 0;
    velocity.current.x = damp(velocity.current.x, targetX, glide, step);
    velocity.current.z = damp(velocity.current.z, targetZ, glide, step);

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
    const tryX = place.current.x + velocity.current.x * step;
    const tryZ = place.current.z + velocity.current.z * step;
    if (!blocked(tryX, place.current.z, curb)) place.current.x = tryX;
    else velocity.current.x = 0;
    if (!blocked(place.current.x, tryZ, curb)) place.current.z = tryZ;
    else velocity.current.z = 0;

    const feet = surfaceY(place.current.x, place.current.z);
    const float = reducedMotion ? 0 : Math.sin(performance.now() * 0.0011) * 0.035;
    const desiredEye = feet + EYE + float;
    eye.current = damp(eye.current, desiredEye, reducedMotion ? 18 : 4.5, step);

    lookDirection(yaw.current, pitch.current, direction.current);
    desiredLook.current.set(
      place.current.x + direction.current.x,
      eye.current + direction.current.y,
      place.current.z + direction.current.z,
    );
    if (lookAt.current.lengthSq() === 0) lookAt.current.copy(desiredLook.current);
    lookAt.current.lerp(desiredLook.current, reducedMotion ? 1 : 1 - Math.exp(-8 * step));

    camera.position.set(place.current.x, eye.current, place.current.z);
    camera.lookAt(lookAt.current);

    if (camera instanceof THREE.PerspectiveCamera) {
      fov.current = damp(fov.current, fovTarget.current, reducedMotion ? 18 : 6, step);
      if (Math.abs(camera.fov - fov.current) > 0.01) {
        camera.fov = fov.current;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}
