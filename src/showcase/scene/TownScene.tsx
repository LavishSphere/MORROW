import { type ReactNode } from "react";
import basemap from "../../../data/wellesley/basemap.geojson";
import { footprintSource } from "../layout";
import { CameraRig } from "./CameraRig";
import { City } from "./City";
import { HORIZON_HAZE, Sky } from "./Space";
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

const CITY_SPAN = 78;
const LOOK_AT = [8, 3.2, 6] as const;
const SETTLED = [46, 34, 50] as const;

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

  return (
    <group name={`footprints-${source}`}>
      {/* Background and fog match the sky's horizon haze. */}
      <color attach="background" args={[HORIZON_HAZE]} />
      <fog attach="fog" args={[HORIZON_HAZE, 120, 240]} />
      <hemisphereLight args={["#f2ffff", "#0a3842", 1.15]} />
      <directionalLight
        position={[40, 52, 18]}
        intensity={1.15}
        color={"#f7ffff"}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-24, 18, 30]} intensity={0.58} color="#7ee0ea" />
      <Sky reducedMotion={reducedMotion} />
      <CameraRig
        reducedMotion={reducedMotion}
        descendSignal={descendSignal}
        span={CITY_SPAN}
        lookAt={LOOK_AT}
        settled={SETTLED}
      />
      <City />
      <group visible={false}>
        <Street
          selectedBarrierId={selectedBarrierId}
          selectedInterventionId={selectedInterventionId}
          onSelectBarrier={onSelectBarrier}
          onSelectIntervention={onSelectIntervention}
        />
      </group>
      {children}
    </group>
  );
}
