import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { TownScene } from "./scene/TownScene";
// Switch these stubs to the real modules when those seats land:
// import { OpeningSequence } from "../brand/OpeningSequence";
// import { RouteRibbon } from "../route/RouteRibbon";
// import { BarrierMarkers } from "../route/BarrierMarkers";
import { BarrierMarkers } from "./stubs/BarrierMarkers";
import { OpeningSequence } from "./stubs/OpeningSequence";
import { RouteRibbon } from "./stubs/RouteRibbon";
import type { ShowcaseCanvasProps } from "./types";

const OPENING_LOOK: [number, number, number] = [0.15, 0.35, 0.1];

export function ShowcaseCanvas({
  geoJson,
  barriers,
  selectedBarrierId = null,
  selectedInterventionId = null,
  routeGeometry,
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
    >
      <Canvas
        camera={{ fov: 42, near: 0.1, far: 200, position: [13.2, -1.1, 12.4] }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.12,
        }}
        onCreated={({ camera }) => {
          camera.lookAt(...OPENING_LOOK);
        }}
      >
        <TownScene
          geoJson={geoJson}
          selectedBarrierId={selectedBarrierId}
          selectedInterventionId={selectedInterventionId}
          reducedMotion={reducedMotion}
          onSelectBarrier={onSelectBarrier}
          onSelectIntervention={onSelectIntervention}
        >
          <RouteRibbon routeGeometry={routeGeometry} reducedMotion={reducedMotion} />
          <BarrierMarkers
            barriers={barriers}
            selectedBarrierId={selectedBarrierId}
            selectedInterventionId={selectedInterventionId}
            reducedMotion={reducedMotion}
            onSelectBarrier={onSelectBarrier}
            onSelectIntervention={onSelectIntervention}
          />
        </TownScene>
      </Canvas>
      <OpeningSequence reducedMotion={reducedMotion} />
      <p className="sr-only" role="status">
        {selectedBarrierId ? `Barrier ${selectedBarrierId} selected.` : "No barrier selected."}{" "}
        {selectedInterventionId
          ? `Intervention ${selectedInterventionId} selected.`
          : "No intervention selected."}
      </p>
    </div>
  );
}
