import { useCursor } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  BARRIER_CURB_ID,
  CURB_POSITION,
  CURB_SIZE,
  INTERVENTION_RAMP_ID,
  RAMP_LENGTH,
  RAMP_POSITION,
  RAMP_RISE,
  RAMP_WIDTH,
} from "../layout";
import { Surface } from "../materials";
import { LOGO_BLUE, scene } from "../palette";
import { createRampGeometry } from "./geometries";

type StreetProps = {
  selectedBarrierId?: string | null;
  selectedInterventionId?: string | null;
  onSelectBarrier?: (id: string) => void;
  onSelectIntervention?: (id: string) => void;
};

/**
 * Clickable curb → ramp at the illustrative Wellesley barrier.
 * Selecting the curb emits the demo-dataset barrier + intervention ids.
 */
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

  return (
    <group name="street-intervention">
      {!rampActive && (
        <group
          name={BARRIER_CURB_ID}
          position={CURB_POSITION}
          onClick={(event) => {
            event.stopPropagation();
            onSelectBarrier?.(BARRIER_CURB_ID);
            onSelectIntervention?.(INTERVENTION_RAMP_ID);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHot("curb");
          }}
          onPointerOut={() => setHot(null)}
        >
          {(hot === "curb" || curbSelected) && (
            <mesh scale={[1.12, 1.18, 1.1]} raycast={() => null}>
              <boxGeometry args={CURB_SIZE} />
              <meshBasicMaterial color={LOGO_BLUE} side={THREE.BackSide} />
            </mesh>
          )}
          <mesh castShadow>
            <boxGeometry args={CURB_SIZE} />
            <Surface
              color={curbSelected ? LOGO_BLUE : scene.curb}
              emissive={LOGO_BLUE}
              emissiveIntensity={curbSelected ? 0.4 : hot === "curb" ? 0.22 : 0}
              roughness={0.7}
            />
          </mesh>
        </group>
      )}

      {rampActive && (
        <group
          name={INTERVENTION_RAMP_ID}
          position={RAMP_POSITION}
          onClick={(event) => {
            event.stopPropagation();
            onSelectIntervention?.(INTERVENTION_RAMP_ID);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHot("ramp");
          }}
          onPointerOut={() => setHot(null)}
        >
          <mesh geometry={rampGeometry} castShadow>
            <Surface
              color={scene.sidewalk}
              emissive={LOGO_BLUE}
              emissiveIntensity={0.28}
              roughness={0.72}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
