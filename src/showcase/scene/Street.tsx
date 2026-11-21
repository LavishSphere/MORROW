import { useEffect, useMemo, useState } from "react";
import { useCursor } from "@react-three/drei";
import * as THREE from "three";
import { ToonMaterial } from "../materials";
import { LOGO_BLUE, scene } from "../palette";
import {
  BARRIER_CURB_ID,
  CROSSING_Z,
  CURB_POSITION,
  CURB_SIZE,
  GAP_Z0,
  GAP_Z1,
  INTERVENTION_RAMP_ID,
  RAMP_LENGTH,
  RAMP_POSITION,
  RAMP_RISE,
  RAMP_WIDTH,
  SIDEWALK_TOP,
  STREET_LENGTH,
  STREET_TOP,
  STREET_Z0,
  STREET_Z1,
  STREET_Z_CENTER,
} from "../layout";
import { createRampGeometry } from "./geometries";

type StreetProps = {
  selectedBarrierId?: string | null;
  selectedInterventionId?: string | null;
  onSelectBarrier?: (id: string) => void;
  onSelectIntervention?: (id: string) => void;
};

const LIP_X = 1.05;
const LIP_WIDTH = 0.16;
const southLipLength = GAP_Z0 - STREET_Z0;
const southLipCenter = (STREET_Z0 + GAP_Z0) / 2;
const northLipLength = STREET_Z1 - GAP_Z1;
const northLipCenter = (GAP_Z1 + STREET_Z1) / 2;

export function Street({
  selectedBarrierId,
  selectedInterventionId,
  onSelectBarrier,
  onSelectIntervention,
}: StreetProps) {
  const rampActive = selectedInterventionId === INTERVENTION_RAMP_ID;
  const curbSelected = selectedBarrierId === BARRIER_CURB_ID;
  const [hot, setHot] = useState<"curb" | "ramp" | null>(null);
  useCursor(hot !== null);

  const rampGeometry = useMemo(
    () => createRampGeometry(RAMP_LENGTH, RAMP_RISE, RAMP_WIDTH),
    [],
  );
  useEffect(() => () => rampGeometry.dispose(), [rampGeometry]);

  const selectBarrier = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelectBarrier?.(BARRIER_CURB_ID);
  };
  const selectRamp = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelectIntervention?.(INTERVENTION_RAMP_ID);
  };

  return (
    <group>
      <mesh position={[0, STREET_TOP - 0.04, STREET_Z_CENTER]}>
        <boxGeometry args={[2.02, 0.08, STREET_LENGTH]} />
        <ToonMaterial color={scene.asphalt} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.48, (SIDEWALK_TOP + 0.04) / 2, STREET_Z_CENTER]}>
          <boxGeometry args={[0.86, SIDEWALK_TOP - 0.04, STREET_LENGTH]} />
          <ToonMaterial color={scene.sidewalk} />
        </mesh>
      ))}
      <mesh position={[-LIP_X, (STREET_TOP + SIDEWALK_TOP) / 2, STREET_Z_CENTER]}>
        <boxGeometry args={[LIP_WIDTH, SIDEWALK_TOP - STREET_TOP, STREET_LENGTH]} />
        <ToonMaterial color={scene.stone} />
      </mesh>
      <mesh position={[LIP_X, (STREET_TOP + SIDEWALK_TOP) / 2, southLipCenter]}>
        <boxGeometry args={[LIP_WIDTH, SIDEWALK_TOP - STREET_TOP, southLipLength]} />
        <ToonMaterial color={scene.stone} />
      </mesh>
      <mesh position={[LIP_X, (STREET_TOP + SIDEWALK_TOP) / 2, northLipCenter]}>
        <boxGeometry args={[LIP_WIDTH, SIDEWALK_TOP - STREET_TOP, northLipLength]} />
        <ToonMaterial color={scene.stone} />
      </mesh>
      {[-0.33, -0.11, 0.11, 0.33].map((offset) => (
        <mesh key={offset} position={[0, STREET_TOP + 0.012, CROSSING_Z + offset]}>
          <boxGeometry args={[1.55, 0.02, 0.1]} />
          <meshBasicMaterial color={scene.crosswalk} />
        </mesh>
      ))}

      {!rampActive && (
        <group
          name={BARRIER_CURB_ID}
          position={CURB_POSITION}
          onClick={selectBarrier}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHot("curb");
          }}
          onPointerOut={() => setHot(null)}
        >
          {(hot === "curb" || curbSelected) && (
            <mesh scale={[1.12, 1.12, 1.12]} raycast={() => null}>
              <boxGeometry args={CURB_SIZE} />
              <meshBasicMaterial color={LOGO_BLUE} side={THREE.BackSide} toneMapped={false} />
            </mesh>
          )}
          <mesh>
            <boxGeometry args={CURB_SIZE} />
            <ToonMaterial
              color={curbSelected ? LOGO_BLUE : scene.curb}
              emissive={LOGO_BLUE}
              emissiveIntensity={curbSelected ? 0.45 : 0.12}
            />
          </mesh>
          <mesh position={[-CURB_SIZE[0] / 2, 0, 0]} raycast={() => null}>
            <boxGeometry args={[0.05, CURB_SIZE[1], CURB_SIZE[2]]} />
            <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
          </mesh>
        </group>
      )}

      {rampActive && (
        <group
          name={INTERVENTION_RAMP_ID}
          position={RAMP_POSITION}
          onClick={selectRamp}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHot("ramp");
          }}
          onPointerOut={() => setHot(null)}
        >
          <mesh scale={[1.05, 1.08, 1.06]} geometry={rampGeometry} raycast={() => null}>
            <meshBasicMaterial color={LOGO_BLUE} side={THREE.BackSide} toneMapped={false} />
          </mesh>
          <mesh geometry={rampGeometry}>
            <ToonMaterial
              color={scene.sidewalk}
              emissive={LOGO_BLUE}
              emissiveIntensity={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
