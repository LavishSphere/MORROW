import { Canvas } from "@react-three/fiber";
import { useCallback, useState } from "react";
import * as THREE from "three";
import { OpeningSequence } from "../brand/OpeningSequence";
import { BarrierMarkers } from "../route/BarrierMarkers";
import { RouteRibbon } from "../route/RouteRibbon";
import { BARRIER_CURB_ID, CURB_POSITION, INTERVENTION_RAMP_ID, RAMP_POSITION } from "./layout";
import { FIX_SPOTS } from "./scene/cityData";
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
  const [spotIndex, setSpotIndex] = useState(0);
  const [glideToken, setGlideToken] = useState(0);
  const spot = FIX_SPOTS[spotIndex] ?? FIX_SPOTS[0];
  const activate = useCallback((index: number) => {
    const count = FIX_SPOTS.length;
    setSpotIndex(((index % count) + count) % count);
    setGlideToken((current) => current + 1);
  }, []);
  const cycle = useCallback(
    (direction: -1 | 1) => {
      activate(spotIndex + direction);
    },
    [activate, spotIndex],
  );

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
          glideToken={glideToken}
          glideTo={glideToken > 0 ? spot : null}
          onCycle={cycle}
          spotIndex={spotIndex}
          onActivateSpot={activate}
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
      <div className="fix-nav">
        <button type="button" onClick={() => cycle(-1)} aria-label="Previous place to fix">
          Left
        </button>
        <span>{spot.label}</span>
        <button type="button" onClick={() => cycle(1)} aria-label="Next place to fix">
          Right
        </button>
      </div>
      <p className="walk-hint">Drag to look · WASD along the view · Scroll zooms · Click a blue arrow or Left and Right to glide · Click the curb and it becomes a ramp</p>
      <p className="sr-only" role="status">
        {selectedBarrierId ? `Barrier ${selectedBarrierId} selected.` : "No barrier selected."}{" "}
        {selectedInterventionId
          ? `Intervention ${selectedInterventionId} selected.`
          : "No intervention selected."}
      </p>
    </div>
  );
}
