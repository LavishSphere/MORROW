import type { ReactNode } from "react";
import { INTERVENTION_RAMP_ID, footprintSource } from "../layout";
import { LOGO_BLUE } from "../palette";
import { City } from "./City";
import { Grass } from "./Grass";
import { Sky } from "./Space";
import { Street } from "./Street";
import { Walker } from "./Walker";

type TownSceneProps = {
  geoJson?: unknown;
  selectedBarrierId?: string | null;
  selectedInterventionId?: string | null;
  reducedMotion: boolean;
  onSelectBarrier?: (id: string) => void;
  onSelectIntervention?: (id: string) => void;
  children?: ReactNode;
};

export function TownScene({
  geoJson,
  selectedBarrierId,
  selectedInterventionId,
  reducedMotion,
  onSelectBarrier,
  onSelectIntervention,
  children,
}: TownSceneProps) {
  const source = footprintSource(geoJson);

  return (
    <group name={`footprints-${source}`}>
      <color attach="background" args={["#02060c"]} />
      <fog attach="fog" args={["#071018", 28, 120]} />
      <hemisphereLight args={["#16324f", "#0c1210", 0.35]} />
      <directionalLight
        position={[18, 22, -8]}
        intensity={1.35}
        color={"#d7e6ff"}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-8, 6, 12]} intensity={0.85} color={LOGO_BLUE} />
      <Sky />
      <Grass />
      <City />
      <Street
        selectedBarrierId={selectedBarrierId}
        selectedInterventionId={selectedInterventionId}
        onSelectBarrier={onSelectBarrier}
        onSelectIntervention={onSelectIntervention}
      />
      {children}
      <Walker
        reducedMotion={reducedMotion}
        rampOpen={selectedInterventionId === INTERVENTION_RAMP_ID}
      />
    </group>
  );
}
