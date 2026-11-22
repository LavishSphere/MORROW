import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OPENING_DESCEND_MS, OPENING_REDUCED_DESCEND_MS } from "../../brand/OpeningSequence";
import { getCityState, publishPose } from "../cityStore";

type CameraRigProps = {
  reducedMotion: boolean;
  /** Fired by OpeningSequence when the lockup starts fading. */
  descendSignal: { durationMs: number; token: number } | null;
  lookAt?: readonly [number, number, number];
  span?: number;
  settled?: readonly [number, number, number];
};

/** Keys that move the camera. Lower-cased `KeyboardEvent.key` values. */
const MOVE_KEYS = new Set([
  "w", "a", "s", "d",
  "arrowup", "arrowdown", "arrowleft", "arrowright",
  "q", "e", "=", "+", "-", "_", "shift",
]);

/** Never steal keys from text fields, buttons, or the mode tabs. */
function isTyping(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.getAttribute("role") === "tab") return true;
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName);
}

type Controls = { target: THREE.Vector3; update: () => void };

/** Closest the camera may get to what it looks at: street level. */
const MIN_DISTANCE = 4;

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
  settled,
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
    () =>
      settled
        ? new THREE.Vector3(settled[0], settled[1], settled[2])
        : new THREE.Vector3(span * 0.42, span * 0.48, span * 0.62),
    [span, settled],
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
  const controls = useThree((state) => state.controls) as unknown as Controls | null;
  const keys = useRef(new Set<string>());
  // Keys pressed since the last frame, so a quick tap still nudges the view.
  const tapped = useRef(new Set<string>());
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const step = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  /** Without a published map, how far from the center the camera may wander. */
  const bound = span * 0.6;
  const lastPublish = useRef(0);
  const lastFly = useRef(0);
  const flight = useRef<{
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    fromDist: number;
    toDist: number | null;
    /** Viewing direction (target → camera) at the start and end. */
    fromDir: THREE.Vector3;
    toDir: THREE.Vector3 | null;
    t: number;
  } | null>(null);
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

  // Keyboard movement: WASD / arrows move, Q / E turn, + / − zoom, Shift is faster.
  useEffect(() => {
    const held = keys.current;
    const down = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(document.activeElement)) return;
      const key = event.key.toLowerCase();
      if (!MOVE_KEYS.has(key)) return;
      held.add(key);
      tapped.current.add(key);
      if (key !== "shift") event.preventDefault();
    };
    const release = (event: KeyboardEvent) => held.delete(event.key.toLowerCase());
    const clear = () => held.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useFrame(({ clock }, delta) => {
    if (!orbitReady || !controls) return;
    // A broken camera renders nothing (a black screen). Put it back.
    const p = camera.position;
    const g = controls.target;
    if (!Number.isFinite(p.x + p.y + p.z + g.x + g.y + g.z)) {
      g.copy(look);
      camera.position.copy(end);
      flight.current = null;
      controls.update();
      return;
    }
    const held = new Set([...keys.current, ...tapped.current]);
    tapped.current.clear();
    let moved = false;
    const dt = Math.min(delta, 0.05);
    const fast = held.has("shift") ? 2.6 : 1;

    // Ground-plane directions from where the camera is looking.
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, up).normalize();

    step.set(0, 0, 0);
    if (held.has("w") || held.has("arrowup")) step.add(forward);
    if (held.has("s") || held.has("arrowdown")) step.sub(forward);
    if (held.has("d") || held.has("arrowright")) step.add(right);
    if (held.has("a") || held.has("arrowleft")) step.sub(right);
    if (step.lengthSq() > 0) {
      step.normalize().multiplyScalar(span * 0.32 * fast * dt);
      camera.position.add(step);
      controls.target.add(step);
      moved = true;
    }

    const turn = (held.has("q") ? 1 : 0) - (held.has("e") ? 1 : 0);
    if (turn !== 0) {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(up, turn * 1.2 * fast * dt);
      camera.position.copy(controls.target).add(offset);
      moved = true;
    }

    const zoom = (held.has("=") || held.has("+") ? 1 : 0) - (held.has("-") || held.has("_") ? 1 : 0);
    if (zoom !== 0) {
      const offset = camera.position.clone().sub(controls.target);
      const next = THREE.MathUtils.clamp(
        offset.length() * (1 - zoom * 1.4 * fast * dt),
        MIN_DISTANCE,
        span * 1.8,
      );
      camera.position.copy(controls.target).add(offset.setLength(next));
      moved = true;
    }

    // Minimap clicks: glide the view to the chosen spot.
    const fly = getCityState().fly;
    const flyEdges = getCityState().map?.bounds;
    if (fly && fly.id !== lastFly.current) {
      lastFly.current = fly.id;
      flight.current = {
        fromX: controls.target.x,
        fromZ: controls.target.z,
        toX: flyEdges ? THREE.MathUtils.clamp(fly.x, flyEdges.minX, flyEdges.maxX) : fly.x,
        toZ: flyEdges ? THREE.MathUtils.clamp(fly.z, flyEdges.minZ, flyEdges.maxZ) : fly.z,
        fromDist: camera.position.distanceTo(controls.target),
        toDist: fly.distance ?? null,
        fromDir: camera.position.clone().sub(controls.target).normalize(),
        // Overhead: same compass heading, looking down at about 58°.
        toDir: fly.overhead
          ? (() => {
              const d = camera.position.clone().sub(controls.target);
              const flat = Math.hypot(d.x, d.z) || 1;
              const up = Math.tan(THREE.MathUtils.degToRad(58));
              return new THREE.Vector3(d.x / flat, up, d.z / flat).normalize();
            })()
          : null,
        // Teleport: finish the move in this very frame.
        t: fly.instant ? 1 : 0,
      };
    }
    if (flight.current) {
      const f = flight.current;
      f.t = reducedMotion ? 1 : Math.min(1, f.t + dt / 0.9);
      const k = smoothstep(f.t);
      const nx = f.fromX + (f.toX - f.fromX) * k;
      const nz = f.fromZ + (f.toZ - f.fromZ) * k;
      camera.position.x += nx - controls.target.x;
      camera.position.z += nz - controls.target.z;
      controls.target.x = nx;
      controls.target.z = nz;
      if (f.toDist !== null) {
        // Zoom in or out on the way, keeping the viewing angle.
        const offset = f.toDir
          ? f.fromDir.clone().lerp(f.toDir, k).normalize()
          : camera.position.clone().sub(controls.target);
        const want = THREE.MathUtils.clamp(f.fromDist + (f.toDist - f.fromDist) * k, MIN_DISTANCE, span * 1.8);
        camera.position.copy(controls.target).add(offset.setLength(want));
      }
      moved = true;
      if (f.t >= 1) flight.current = null;
    }

    // Walk and fly stay inside the loaded city. The eye is not boxed in,
    // so land, water, and a neighboring city past the edge stay in view.
    // There is no wall.
    const t = controls.target;
    const edges = getCityState().map?.bounds;
    const cx = edges
      ? THREE.MathUtils.clamp(t.x, edges.minX, edges.maxX)
      : THREE.MathUtils.clamp(t.x, look.x - bound, look.x + bound);
    const cz = edges
      ? THREE.MathUtils.clamp(t.z, edges.minZ, edges.maxZ)
      : THREE.MathUtils.clamp(t.z, look.z - bound, look.z + bound);
    if (cx !== t.x || cz !== t.z) {
      camera.position.x += cx - t.x;
      camera.position.z += cz - t.z;
      t.x = cx;
      t.z = cz;
      moved = true;
    }
    if (moved) controls.update();

    // Tell the minimap where we are, a few times a second.
    if (clock.elapsedTime - lastPublish.current > 0.1) {
      lastPublish.current = clock.elapsedTime;
      publishPose({
        x: t.x,
        z: t.z,
        dirX: forward.x,
        dirZ: forward.z,
        distance: camera.position.distanceTo(t),
      });
    }
  });

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
      makeDefault
      enabled={orbitReady}
      // Left-drag rotates, right-drag (two fingers on touch) slides across
      // the ground, scroll or pinch zooms down to street level.
      enablePan
      screenSpacePanning={false}
      panSpeed={1.1}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      minDistance={MIN_DISTANCE}
      maxDistance={span * 1.8}
      minPolarAngle={0.55}
      maxPolarAngle={Math.PI * 0.46}
      target={[look.x, look.y, look.z]}
    />
  );
}
