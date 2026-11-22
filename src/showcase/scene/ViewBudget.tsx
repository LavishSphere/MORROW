import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { cameraMotion } from "../motion";
import { FramePace, frameStrain, pickDpr } from "../viewBudget";

/** Sharpest the canvas renders: Retina screens at 2× would draw 4× the pixels. */
export const DPR_MAX = 1.5;

/**
 * Spends the GPU where it shows. The canvas renders at most DPR_MAX; on a
 * GPU that cannot keep up while the camera moves, it drops to 1× until
 * the view rests (SETTLE_MS), and to 1× for good if even resting frames
 * are slow. Also keeps `cameraMotion` up to date for the rest of the city,
 * and `frameStrain`, which holds back more map tiles while frames are slow.
 */
export function ViewBudget() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const setDpr = useThree((state) => state.setDpr);
  const memo = useRef({ dpr: 0, skip: 0 });
  const pace = useRef({ moving: new FramePace(), resting: new FramePace(60, 24) });

  // Scroll, drag, and keys count as moving before the camera reacts.
  useEffect(() => {
    const touch = () => cameraMotion.input(Date.now());
    const drag = (event: PointerEvent) => {
      if (event.buttons) touch();
    };
    const element = gl.domElement;
    element.addEventListener("wheel", touch, { passive: true });
    element.addEventListener("pointerdown", touch);
    element.addEventListener("pointermove", drag);
    window.addEventListener("keydown", touch);
    return () => {
      element.removeEventListener("wheel", touch);
      element.removeEventListener("pointerdown", touch);
      element.removeEventListener("pointermove", drag);
      window.removeEventListener("keydown", touch);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const now = Date.now();
    camera.updateMatrixWorld();
    cameraMotion.update(camera.matrixWorld.elements, now);
    const busy = cameraMotion.busy(now);
    const m = memo.current;
    frameStrain.add(delta * 1000);
    // Frame times at full resolution only; the frames right after a resize are slow anyway.
    if (m.skip > 0) m.skip -= 1;
    else if (m.dpr > 1) (busy ? pace.current.moving : pace.current.resting).add(delta * 1000);
    const sharp = Math.min(DPR_MAX, Math.max(1, window.devicePixelRatio || 1));
    const dpr = pickDpr({
      sharp,
      busy,
      slowMoving: pace.current.moving.slow,
      slowResting: pace.current.resting.slow,
    });
    if (dpr !== m.dpr) {
      m.dpr = dpr;
      m.skip = 3;
      setDpr(dpr);
    }
  });

  return null;
}
