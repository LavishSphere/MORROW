import { Canvas } from "@react-three/fiber";
import { useCallback, useState } from "react";
import * as THREE from "three";
import {
  OpeningSequence,
  type DescentSignal,
} from "../brand/OpeningSequence";
import { RouteRibbon } from "../route/RouteRibbon";
import basemap from "../../data/wellesley/basemap.geojson";
import { TownScene } from "./scene/TownScene";
import type { ShowcaseCanvasProps } from "./types";

export function ShowcaseCanvas({
  geoJson = basemap,
  barriers = [],
  selectedBarrierId = null,
  selectedInterventionId = null,
  routeGeometry,
  reducedMotion = false,
  onSelectBarrier,
  onSelectIntervention,
}: ShowcaseCanvasProps) {
  const [descendSignal, setDescendSignal] = useState<{
    durationMs: number;
    token: number;
  } | null>(null);

  const handleDescend = useCallback((signal: DescentSignal) => {
    setDescendSignal({
      durationMs: signal.durationMs,
      token: Date.now(),
    });
  }, []);

  return (
    <div
      className="showcase"
      data-selected-barrier={selectedBarrierId ?? ""}
      data-selected-intervention={selectedInterventionId ?? ""}
      data-reduced-motion={reducedMotion ? "reduce" : "no-preference"}
      data-footprint="geojson"
      data-barrier-count={barriers.length}
    >
      <Canvas
        shadows
        camera={{
          fov: 42,
          near: 0.1,
          far: 220,
          position: [2.4, 22, 17],
        }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0.35, 0);
        }}
      >
        <TownScene
          geoJson={geoJson}
          selectedBarrierId={selectedBarrierId}
          selectedInterventionId={selectedInterventionId}
          reducedMotion={reducedMotion}
          descendSignal={descendSignal}
          onSelectBarrier={onSelectBarrier}
          onSelectIntervention={onSelectIntervention}
        >
          <RouteRibbon
            routeGeometry={routeGeometry?.points}
            reducedMotion={reducedMotion}
          />
        </TownScene>
      </Canvas>
      <OpeningSequence reducedMotion={reducedMotion} onDescend={handleDescend} />
      <p className="map-mark">MORROW</p>
      <p className="walk-hint">
        Drag to orbit · Scroll zooms · Click the curb to install the ramp
      </p>
      <p className="sr-only" role="status">
        {selectedBarrierId ? `Barrier ${selectedBarrierId} selected.` : "No barrier selected."}{" "}
        {selectedInterventionId
          ? `Intervention ${selectedInterventionId} selected.`
          : "No intervention selected."}
      </p>
    </div>
  );
}
