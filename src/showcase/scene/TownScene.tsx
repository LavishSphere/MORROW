import type { ReactNode } from "react";
import { INTERVENTION_RAMP_ID, footprintSource } from "../layout";
import { scene } from "../palette";
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
      <color attach="background" args={[scene.sky]} />
      <fog attach="fog" args={[scene.fog, 48, 150]} />
      <hemisphereLight args={["#d5e4f5", "#6d7a48", 0.62]} />
      <directionalLight
        position={[32, 44, 18]}
        intensity={2.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={150}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-22, 16, -12]} intensity={0.38} />
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
