import { useMemo, type ReactNode } from "react";
import basemap from "../../../data/wellesley/basemap.geojson";
import {
  INTERVENTION_EDGE_IDS,
  INTERVENTION_RAMP_ID,
  defaultProjector,
  footprintSource,
} from "../layout";
import { LOGO_BLUE } from "../palette";
import { CameraRig } from "./CameraRig";
import { GeoNeighborhood } from "./GeoNeighborhood";
import { Sky } from "./Space";
import { Street } from "./Street";

type TownSceneProps = {
  geoJson?: unknown;
  selectedBarrierId?: string | null;
  selectedInterventionId?: string | null;
  reducedMotion: boolean;
  descendSignal: { durationMs: number; token: number } | null;
  onSelectBarrier?: (id: string) => void;
  onSelectIntervention?: (id: string) => void;
  children?: ReactNode;
};

export function TownScene({
  geoJson,
  selectedBarrierId,
  selectedInterventionId,
  reducedMotion,
  descendSignal,
  onSelectBarrier,
  onSelectIntervention,
  children,
}: TownSceneProps) {
  const source = footprintSource(geoJson ?? basemap);
  const mapData = geoJson ?? basemap;
  const highlightedEdgeIds = useMemo(
    () =>
      selectedInterventionId === INTERVENTION_RAMP_ID
        ? [...INTERVENTION_EDGE_IDS]
        : [],
    [selectedInterventionId],
  );

  return (
    <group name={`footprints-${source}`}>
      <color attach="background" args={["#02060c"]} />
      <fog attach="fog" args={["#071018", 18, Math.max(48, defaultProjector.span * 3.2)]} />
      <hemisphereLight args={["#16324f", "#0c1210", 0.4]} />
      <directionalLight
        position={[14, 18, -10]}
        intensity={1.4}
        color={"#d7e6ff"}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-8, 6, 12]} intensity={0.75} color={LOGO_BLUE} />
      <Sky />
      <CameraRig
        reducedMotion={reducedMotion}
        descendSignal={descendSignal}
        span={defaultProjector.span}
        lookAt={[0, 0.35, 0]}
      />
      <GeoNeighborhood
        geoJson={mapData}
        projector={defaultProjector}
        highlightedEdgeIds={highlightedEdgeIds}
      />
      <Street
        selectedBarrierId={selectedBarrierId}
        selectedInterventionId={selectedInterventionId}
        onSelectBarrier={onSelectBarrier}
        onSelectIntervention={onSelectIntervention}
      />
      {children}
    </group>
  );
}
