import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { flyVelocity, placeSpectator, writeGaze } from "./fly";
import "./camera.css";

/** Shown by the city shell. This camera itself draws no overlay. */
export const FLY_HINT =
  "Right-drag to look · WASD flies · Space up · Shift down · Click a blue issue";

const SPEED = 4.2;
const START_YAW = 0.85;
const START_PITCH = -0.48;
const PITCH_MIN = -1.15;
const PITCH_MAX = 0.55;
const YAW_PER_PX = 0.005;
const PITCH_PER_PX = 0.004;
const MAX_FRAME = 0.1;

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

function aim(
  camera: THREE.Camera,
  yaw: number,
  pitch: number,
  gaze: THREE.Vector3,
  target: THREE.Vector3,
) {
  writeGaze(yaw, pitch, gaze);
  target.copy(camera.position).add(gaze);
  camera.lookAt(target);
}

/**
 * Minecraft-style spectator camera for the city canvas.
 * Right-drag or middle-drag looks. WASD moves the way the camera faces.
 * Space rises and Shift descends. Renders nothing of its own.
 */
export function FlyCamera() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const keys = useRef<Record<string, boolean>>({});
  const look = useRef({ yaw: START_YAW, pitch: START_PITCH });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const velocity = useRef(new THREE.Vector3());
  const gaze = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const placed = useRef(false);

  useLayoutEffect(() => {
    const element = gl.domElement;
    const down = (event: PointerEvent) => {
      if (event.button !== 2 && event.button !== 1) return;
      event.preventDefault();
      drag.current = { x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      drag.current = { x: event.clientX, y: event.clientY };
      const next = look.current;
      next.yaw -= dx * YAW_PER_PX;
      next.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, next.pitch - dy * PITCH_PER_PX));
    };
    const up = () => {
      drag.current = null;
    };
    const key = (event: KeyboardEvent) => {
      if (event.type === "keyup") {
        keys.current[event.code] = false;
        return;
      }
      if (isTyping(event.target)) return;
      if (event.code === "Space" && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
      }
      keys.current[event.code] = true;
    };
    const blur = () => {
      keys.current = {};
      drag.current = null;
    };
    const prevent = (event: Event) => event.preventDefault();

    const blockMouse = (event: MouseEvent) => {
      if (event.button === 1 || event.button === 2) event.preventDefault();
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("mousedown", blockMouse);
    element.addEventListener("contextmenu", prevent);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", blur);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("mousedown", blockMouse);
      element.removeEventListener("contextmenu", prevent);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", blur);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (!placed.current) {
      placeSpectator(camera);
      placed.current = true;
    }
    const { yaw, pitch } = look.current;
    const step = flyVelocity(
      keys.current,
      yaw,
      pitch,
      forward.current,
      right.current,
      velocity.current,
    );
    if (step.lengthSq() > 0) {
      camera.position.addScaledVector(step, SPEED * Math.min(delta, MAX_FRAME));
    }
    aim(camera, yaw, pitch, gaze.current, target.current);
  });

  return null;
}
