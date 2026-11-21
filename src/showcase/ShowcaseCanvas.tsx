import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { OpeningSequence } from "../brand/OpeningSequence";
import { BarrierMarkers } from "../route/BarrierMarkers";
import { RouteRibbon } from "../route/RouteRibbon";
import { BARRIER_CURB_ID, CURB_POSITION, INTERVENTION_RAMP_ID, RAMP_POSITION } from "./layout";
import { TownScene } from "./scene/TownScene";
import type { ShowcaseCanvasProps } from "./types";

const OPENING_LOOK: [number, number, number] = [6.15, 1.5, 11.2];

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
        shadows
        camera={{ fov: 72, near: 0.05, far: 400, position: [6.15, 1.76, 13.4] }}
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
          <RouteRibbon
            routeGeometry={routeGeometry?.points}
            reducedMotion={reducedMotion}
          />
          <BarrierMarkers
            selectedBarrierId={selectedBarrierId}
            selectedInterventionId={selectedInterventionId}
            onSelectBarrier={(id) => {
              onSelectBarrier?.(id);
              if (id === BARRIER_CURB_ID) onSelectIntervention?.(INTERVENTION_RAMP_ID);
            }}
            onSelectIntervention={(id) => onSelectIntervention?.(id)}
            curbPosition={barriers[0]?.position ?? CURB_POSITION}
            rampPosition={RAMP_POSITION}
            heading={-Math.PI / 2}
          />
        </TownScene>
      </Canvas>
      <OpeningSequence reducedMotion={reducedMotion} />
      <p className="map-mark">MORROW</p>
      <p className="walk-hint">Click to look · WASD glides on streets · Scroll zooms · Click the curb and it becomes a ramp</p>
      <p className="sr-only" role="status">
        {selectedBarrierId ? `Barrier ${selectedBarrierId} selected.` : "No barrier selected."}{" "}
        {selectedInterventionId
          ? `Intervention ${selectedInterventionId} selected.`
          : "No intervention selected."}
      </p>
    </div>
  );
}
