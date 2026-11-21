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
  streetRoute,
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

function wrapAngle(delta: number) {
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

function dampAngle(current: number, target: number, lambda: number, step: number) {
  return current + wrapAngle(target - current) * (1 - Math.exp(-lambda * step));
}

export function Walker({
  reducedMotion,
  rampOpen,
  glideToken = 0,
  glideTo = null,
  onCycle,
}: {
  reducedMotion: boolean;
  rampOpen: boolean;
  glideToken?: number;
  glideTo?: { x: number; z: number; yaw: number } | null;
  onCycle?: (direction: -1 | 1) => void;
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
  const glide = useRef<{ points: { x: number; z: number }[]; index: number; yaw: number } | null>(null);
  const seenGlide = useRef(0);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "KeyW" || event.code === "ArrowUp") keys.current.forward = true;
      if (event.code === "KeyS" || event.code === "ArrowDown") keys.current.back = true;
      if (event.code === "KeyA") keys.current.left = true;
      if (event.code === "KeyD") keys.current.right = true;
      if (!event.repeat && (event.code === "ArrowLeft" || event.code === "BracketLeft")) onCycle?.(-1);
      if (!event.repeat && (event.code === "ArrowRight" || event.code === "BracketRight")) onCycle?.(1);
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
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") keys.current.run = false;
    };
    const drag = { x: 0, y: 0, moved: false, active: false };
    const lookScale = reducedMotion ? 1 : 0.9;
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      drag.active = true;
      drag.moved = false;
      drag.x = event.clientX;
      drag.y = event.clientY;
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag.active) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      gl.domElement.style.cursor = "grabbing";
      yaw.current += dx * 0.0024 * lookScale;
      const next = pitch.current - dy * 0.0018 * lookScale;
      pitch.current = Math.min(0.85, Math.max(-1.05, next));
      drag.x = event.clientX;
      drag.y = event.clientY;
    };
    const pointerUp = () => {
      drag.active = false;
      gl.domElement.style.cursor = "grab";
    };
    const swallowDragClick = (event: MouseEvent) => {
      if (!drag.moved) return;
      drag.moved = false;
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      const next = fovTarget.current + event.deltaY * 0.035;
      fovTarget.current = Math.min(MAX_FOV, Math.max(MIN_FOV, next));
    };
    gl.domElement.style.cursor = "grab";
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    gl.domElement.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    gl.domElement.addEventListener("click", swallowDragClick, true);
    gl.domElement.addEventListener("wheel", zoom, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      gl.domElement.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      gl.domElement.removeEventListener("click", swallowDragClick, true);
      gl.domElement.removeEventListener("wheel", zoom);
      gl.domElement.style.cursor = "";
    };
  }, [gl, onCycle, reducedMotion]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);
    const response = reducedMotion ? 16 : 4.8;
    lookDirection(yaw.current, 0, direction.current);
    const forwardX = direction.current.x;
    const forwardZ = direction.current.z;
    // Camera-right on the ground: W follows the view, D steps to that right.
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const inputZ = (keys.current.forward ? 1 : 0) - (keys.current.back ? 1 : 0);
    const inputX = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
    const length = Math.hypot(inputX, inputZ) || 1;
    const moving = inputX !== 0 || inputZ !== 0;
    const speed = keys.current.run ? 8.4 : 4.6;
    const targetX = moving ? ((forwardX * inputZ + rightX * inputX) / length) * speed : 0;
    const targetZ = moving ? ((forwardZ * inputZ + rightZ * inputX) / length) * speed : 0;
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
    if (glideTo && glideToken !== seenGlide.current) {
      seenGlide.current = glideToken;
      if (glideToken > 0) {
        glide.current = {
          points: streetRoute(place.current, glideTo),
          index: 0,
          yaw: glideTo.yaw,
        };
        velocity.current.x = 0;
        velocity.current.z = 0;
      }
    }
    if (glide.current && moving) glide.current = null;

    if (glide.current) {
      const path = glide.current;
      const dest = path.points[Math.min(path.index + 1, path.points.length - 1)];
      const dx = dest.x - place.current.x;
      const dz = dest.z - place.current.z;
      const dist = Math.hypot(dx, dz);
      const glideSpeed = reducedMotion ? 80 : 12;
      if (dist < 0.18) {
        place.current.x = dest.x;
        place.current.z = dest.z;
        path.index += 1;
        if (path.index >= path.points.length - 1) {
          yaw.current = dampAngle(yaw.current, path.yaw, reducedMotion ? 20 : 4, step);
          if (Math.abs(wrapAngle(path.yaw - yaw.current)) < 0.05 || reducedMotion) {
            yaw.current = path.yaw;
            glide.current = null;
          }
        }
      } else {
        const stepDist = Math.min(dist, glideSpeed * step);
        const nx = place.current.x + (dx / dist) * stepDist;
        const nz = place.current.z + (dz / dist) * stepDist;
        if (!blocked(nx, nz, curb)) {
          place.current.x = nx;
          place.current.z = nz;
          yaw.current = dampAngle(yaw.current, Math.atan2(-dx, dz), reducedMotion ? 20 : 6, step);
        } else {
          glide.current = null;
        }
      }
      velocity.current.x = 0;
      velocity.current.z = 0;
    }

    velocity.current.x = damp(velocity.current.x, glide.current ? 0 : targetX, response, step);
    velocity.current.z = damp(velocity.current.z, glide.current ? 0 : targetZ, response, step);

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
