import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import basemap from "../../data/wellesley/basemap.geojson";
import { CityLoader } from "../brand/CityLoader";
import { TownScene } from "./scene/TownScene";
import type { ShowcaseCanvasProps } from "./types";
import "./styles.css";

/** Frames to paint before the cover can lift. The first frame compiles the city. */
const PAINTED_FRAMES = 3;
/** Avoid a one-frame flash when the city is already warm. */
const MIN_COVER_MS = 700;
/** If the canvas never paints, do not hold the cover forever. */
const COVER_LIMIT_MS = 12000;

function CityPainted({ onPainted }: { onPainted: () => void }) {
  const frames = useRef(0);
  const done = useRef(false);
  const onPaintedRef = useRef(onPainted);

  useEffect(() => {
    onPaintedRef.current = onPainted;
  }, [onPainted]);

  useFrame(() => {
    if (done.current) return;
    frames.current += 1;
    if (frames.current < PAINTED_FRAMES) return;
    done.current = true;
    onPaintedRef.current();
  });

  return null;
}

export function ShowcaseCanvas({
  geoJson = basemap,
  barriers = [],
  selectedBarrierId = null,
  selectedInterventionId = null,
  reducedMotion = false,
  onSelectBarrier,
  onSelectIntervention,
}: ShowcaseCanvasProps) {
  const [covered, setCovered] = useState(true);
  const [startedAt] = useState(() => performance.now());
  const liftTimer = useRef<number | null>(null);

  useEffect(() => {
    const limit = window.setTimeout(() => setCovered(false), COVER_LIMIT_MS);
    return () => {
      window.clearTimeout(limit);
      if (liftTimer.current !== null) window.clearTimeout(liftTimer.current);
    };
  }, []);

  const handlePainted = useCallback(() => {
    if (liftTimer.current !== null) return;
    const elapsed = performance.now() - startedAt;
    const hold = Math.max(0, MIN_COVER_MS - elapsed);
    liftTimer.current = window.setTimeout(() => setCovered(false), hold);
  }, [startedAt]);

  return (
    <div
      className="showcase"
      aria-busy={covered || undefined}
      data-selected-barrier={selectedBarrierId ?? ""}
      data-selected-intervention={selectedInterventionId ?? ""}
      data-reduced-motion={reducedMotion ? "reduce" : "no-preference"}
      data-footprint="holographic-city"
      data-barrier-count={barriers.length}
    >
      <Canvas
        shadows
        camera={{
          fov: 34,
          near: 0.1,
          far: 420,
          position: [46, 34, 50],
        }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.92,
        }}
        onCreated={({ camera }) => {
          camera.lookAt(8, 3.2, 6);
        }}
      >
        <TownScene
          geoJson={geoJson}
          selectedBarrierId={selectedBarrierId}
          selectedInterventionId={selectedInterventionId}
          reducedMotion={reducedMotion}
          descendSignal={{ durationMs: 0, token: 1 }}
          onSelectBarrier={onSelectBarrier}
          onSelectIntervention={onSelectIntervention}
        />
        {covered ? <CityPainted onPainted={handlePainted} /> : null}
      </Canvas>
      <CityLoader active={covered} reducedMotion={reducedMotion} />
      <p className="map-mark">MORROW</p>
      <p className="walk-hint">Drag to orbit · Scroll zooms</p>
      <p className="sr-only" role="status">
        Holographic neighborhood.{" "}
        {selectedBarrierId ? `Barrier ${selectedBarrierId} selected.` : "No barrier selected."}{" "}
        {selectedInterventionId
          ? `Intervention ${selectedInterventionId} selected.`
          : "No intervention selected."}
      </p>
    </div>
  );
}
