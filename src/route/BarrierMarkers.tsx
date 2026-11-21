import { useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Vector3 } from "three";
import {
  CURB_DEPTH,
  CURB_HEIGHT,
  CURB_LENGTH,
  CURB_POSITION,
  LOGO_BLUE,
  RAMP_POSITION,
  RAMP_RISE,
  RAMP_RUN,
  RAMP_WIDTH,
  STREET_HEADING,
} from "./placeholder";

import {
  BARRIER_CURB_ID as LAYOUT_BARRIER_ID,
  INTERVENTION_RAMP_ID as LAYOUT_INTERVENTION_ID,
} from "../showcase/layout";

/** Demo-dataset curb barrier id. */
export const CURB_BARRIER_ID = LAYOUT_BARRIER_ID;
/** Demo-dataset ramp intervention id. */
export const RAMP_INTERVENTION_ID = LAYOUT_INTERVENTION_ID;

export type BarrierMarkersProps = {
  selectedBarrierId?: string | null;
  selectedInterventionId?: string | null;
  onSelectBarrier: (id: string) => void;
  onSelectIntervention: (id: string) => void;
  /** Local position of the curb block. Defaults to the placeholder street edge. */
  curbPosition?: readonly [number, number, number];
  /** Local position of the ramp's low end. Defaults beside the placeholder curb. */
  rampPosition?: readonly [number, number, number];
  /** Yaw in radians for both markers. Defaults to the placeholder street heading. */
  heading?: number;
};

type HoverTarget = "curb" | "ramp" | null;

function tuple(position: readonly [number, number, number]): [number, number, number] {
  return [position[0], position[1], position[2]];
}

function pushTri(out: number[], a: Vector3, b: Vector3, c: Vector3) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function pushQuad(out: number[], a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
  pushTri(out, a, b, c);
  pushTri(out, a, c, d);
}

/** Wedge: low at local z = 0, high at local -Z, base on y = 0. */
function createRampGeometry(width: number, rise: number, run: number): BufferGeometry {
  const halfWidth = width / 2;
  const lowLeft = new Vector3(-halfWidth, 0, 0);
  const lowRight = new Vector3(halfWidth, 0, 0);
  const baseLeft = new Vector3(-halfWidth, 0, -run);
  const baseRight = new Vector3(halfWidth, 0, -run);
  const highLeft = new Vector3(-halfWidth, rise, -run);
  const highRight = new Vector3(halfWidth, rise, -run);
  const positions: number[] = [];
  pushQuad(positions, lowLeft, lowRight, highRight, highLeft);
  pushQuad(positions, lowLeft, baseLeft, baseRight, lowRight);
  pushQuad(positions, baseLeft, highLeft, highRight, baseRight);
  pushTri(positions, lowLeft, highLeft, baseLeft);
  pushTri(positions, lowRight, baseRight, highRight);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function setCursor(event: ThreeEvent<PointerEvent>, cursor: string) {
  const target = event.nativeEvent.target;
  if (target instanceof HTMLElement) target.style.cursor = cursor;
}

/**
 * Clickable curb and ramp for the phase-1 scenario.
 *
 * ShowcaseCanvas imports this as `../route/BarrierMarkers`.
 * The curb calls `onSelectBarrier` with the demo-dataset barrier id.
 * The ramp calls `onSelectIntervention` with the demo-dataset intervention id.
 */
export function BarrierMarkers({
  selectedBarrierId = null,
  selectedInterventionId = null,
  onSelectBarrier,
  onSelectIntervention,
  curbPosition = CURB_POSITION,
  rampPosition = RAMP_POSITION,
  heading = STREET_HEADING,
}: BarrierMarkersProps) {
  const [hovered, setHovered] = useState<HoverTarget>(null);
  const cursorEl = useRef<HTMLElement | null>(null);
  const rampGeometry = useMemo(
    () => createRampGeometry(RAMP_WIDTH, RAMP_RISE, RAMP_RUN),
    [],
  );

  useEffect(() => {
    return () => {
      rampGeometry.dispose();
      if (cursorEl.current) cursorEl.current.style.cursor = "";
    };
  }, [rampGeometry]);

  const curbSelected = selectedBarrierId === CURB_BARRIER_ID;
  const rampSelected = selectedInterventionId === RAMP_INTERVENTION_ID;
  const curbHot = curbSelected || hovered === "curb";
  const rampHot = rampSelected || hovered === "ramp";

  const rememberCursor = (event: ThreeEvent<PointerEvent>, cursor: string) => {
    const target = event.nativeEvent.target;
    if (target instanceof HTMLElement) cursorEl.current = target;
    setCursor(event, cursor);
  };

  return (
    <group name="barrier-markers">
      <mesh
        name={CURB_BARRIER_ID}
        position={tuple(curbPosition)}
        rotation={[0, heading, 0]}
        userData={{ id: CURB_BARRIER_ID, kind: "barrier" }}
        castShadow
        onClick={(event) => {
          event.stopPropagation();
          onSelectBarrier(CURB_BARRIER_ID);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered("curb");
          rememberCursor(event, "pointer");
        }}
        onPointerOut={(event) => {
          setHovered((current) => (current === "curb" ? null : current));
          rememberCursor(event, "auto");
        }}
      >
        <boxGeometry args={[CURB_LENGTH, CURB_HEIGHT, CURB_DEPTH]} />
        <meshStandardMaterial
          color={curbHot ? LOGO_BLUE : "#101820"}
          emissive={LOGO_BLUE}
          emissiveIntensity={curbSelected ? 1.15 : hovered === "curb" ? 0.62 : 0.28}
          roughness={0.62}
          metalness={0.04}
          flatShading
        />
      </mesh>

      <mesh
        name={RAMP_INTERVENTION_ID}
        position={tuple(rampPosition)}
        rotation={[0, heading, 0]}
        geometry={rampGeometry}
        userData={{ id: RAMP_INTERVENTION_ID, kind: "intervention" }}
        castShadow
        onClick={(event) => {
          event.stopPropagation();
          onSelectIntervention(RAMP_INTERVENTION_ID);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered("ramp");
          rememberCursor(event, "pointer");
        }}
        onPointerOut={(event) => {
          setHovered((current) => (current === "ramp" ? null : current));
          rememberCursor(event, "auto");
        }}
      >
        <meshStandardMaterial
          color={rampHot ? LOGO_BLUE : "#101820"}
          emissive={LOGO_BLUE}
          emissiveIntensity={rampSelected ? 1.15 : hovered === "ramp" ? 0.62 : 0.28}
          roughness={0.48}
          metalness={0.04}
          flatShading
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
