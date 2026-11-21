import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import basemap from "../../data/wellesley/basemap.geojson";
import { TownScene } from "./scene/TownScene";
import type { ShowcaseCanvasProps } from "./types";

export function ShowcaseCanvas({
  geoJson = basemap,
  barriers = [],
  selectedBarrierId = null,
  selectedInterventionId = null,
  reducedMotion = false,
  onSelectBarrier,
  onSelectIntervention,
}: ShowcaseCanvasProps) {
  return (
    <div
      className="showcase"
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
      </Canvas>
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
