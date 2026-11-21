import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type * as THREE from "three";
import { footprintSource } from "../layout";
import { LOGO_BLUE } from "../palette";
import { Buildings } from "./Buildings";
import { CameraRig } from "./CameraRig";
import { Island } from "./Island";
import { Space } from "./Space";
import { Street } from "./Street";

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
  const island = useRef<THREE.Group>(null);
  const source = footprintSource(geoJson);

  useFrame(({ clock }) => {
    if (!island.current) return;
    island.current.position.y = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.42) * 0.07;
  });

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <fogExp2 attach="fog" args={["#000000", 0.014]} />
      <ambientLight intensity={0.32} />
      <directionalLight position={[7.5, 11, 6.5]} intensity={2.7} />
      <directionalLight position={[-6, 4, -3]} intensity={0.45} />
      <directionalLight position={[-4, -3.5, -2]} intensity={1.15} color={LOGO_BLUE} />
      <pointLight position={[0, -2.7, 0]} color={LOGO_BLUE} intensity={8} distance={16} decay={2} />
      <Space reducedMotion={reducedMotion} />
      <CameraRig reducedMotion={reducedMotion} />
      <group ref={island} name={`footprints-${source}`}>
        <Island />
        <Buildings />
        <Street
          selectedBarrierId={selectedBarrierId}
          selectedInterventionId={selectedInterventionId}
          onSelectBarrier={onSelectBarrier}
          onSelectIntervention={onSelectIntervention}
        />
        {children}
      </group>
    </>
  );
}
