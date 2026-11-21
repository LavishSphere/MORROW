import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { OpeningSequence } from "../brand/OpeningSequence";
import { BarrierMarkers } from "../route/BarrierMarkers";
import { RouteRibbon } from "../route/RouteRibbon";
import { CURB_POSITION, RAMP_POSITION } from "./layout";
import { TownScene } from "./scene/TownScene";
import type { ShowcaseCanvasProps } from "./types";

const OPENING_LOOK: [number, number, number] = [6.3, 1.35, 15.8];

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
        camera={{ fov: 58, near: 0.08, far: 400, position: [6.3, 1.84, 22.2] }}
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
            onSelectBarrier={(id) => onSelectBarrier?.(id)}
            onSelectIntervention={(id) => onSelectIntervention?.(id)}
            curbPosition={barriers[0]?.position ?? CURB_POSITION}
            rampPosition={RAMP_POSITION}
            heading={-Math.PI / 2}
          />
        </TownScene>
      </Canvas>
      <OpeningSequence reducedMotion={reducedMotion} />
      <p className="walk-hint">Click the street, then WASD to walk. Shift runs. Mouse looks. Esc releases the mouse.</p>
      <p className="sr-only" role="status">
        {selectedBarrierId ? `Barrier ${selectedBarrierId} selected.` : "No barrier selected."}{" "}
        {selectedInterventionId
          ? `Intervention ${selectedInterventionId} selected.`
          : "No intervention selected."}
      </p>
    </div>
  );
}
