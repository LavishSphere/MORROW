import { useCursor } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3 } from "three";
import type { Group } from "three";
import { LOGO_BLUE } from "../palette";
import type { BarrierMarkersProps } from "../types";

type PinProps = {
  position: readonly [number, number, number];
  label: string;
  selected: boolean;
  reducedMotion: boolean;
  onClick: () => void;
};

function ScreenLabel({
  anchor,
  label,
  selected,
  onClick,
}: {
  anchor: readonly [number, number, number];
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const group = useRef<Group>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const click = useRef(onClick);
  const { camera, gl, size } = useThree();
  const point = useMemo(() => new Vector3(), []);
  click.current = onClick;

  useEffect(() => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "pin-label";
    element.innerHTML = `<strong></strong><span>Illustrative</span>`;
    const title = element.querySelector("strong");
    if (title) title.textContent = label;
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      click.current();
    });
    gl.domElement.parentElement?.appendChild(element);
    button.current = element;
    return () => {
      element.remove();
    };
  }, [gl, label]);

  useEffect(() => {
    button.current?.classList.toggle("is-selected", selected);
  }, [selected]);

  useFrame(() => {
    const element = button.current;
    if (!group.current || !element) return;
    group.current.getWorldPosition(point);
    point.project(camera);
    const x = (point.x * 0.5 + 0.5) * size.width;
    const y = (point.y * -0.5 + 0.5) * size.height;
    element.style.transform = `translate(-50%, -120%) translate(${x}px, ${y}px)`;
    element.style.visibility = point.z > 1 ? "hidden" : "visible";
  });

  return <group ref={group} position={[anchor[0], anchor[1], anchor[2]]} />;
}

function Pin({ position, label, selected, reducedMotion, onClick }: PinProps) {
  const diamond = useRef<Group>(null);
  const [hot, setHot] = useState(false);
  useCursor(hot);

  useFrame(({ clock }) => {
    if (!diamond.current) return;
    const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 2.8) * 0.05;
    const scale = (selected ? 1.16 : 1) * (hot ? 1.08 : 1) * pulse;
    diamond.current.scale.setScalar(scale);
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
      <group ref={diamond}>
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHot(true);
          }}
          onPointerOut={() => setHot(false)}
        >
          <octahedronGeometry args={[0.2, 0]} />
          <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.28, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.025, 0.025, 0.36, 5]} />
          <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
        </mesh>
      </group>
      <ScreenLabel anchor={[0, 0.46, 0]} label={label} selected={selected} onClick={onClick} />
    </group>
  );
}

/** Temporary stand-in for src/route/BarrierMarkers. */
export function BarrierMarkers({
  barriers,
  selectedBarrierId,
  selectedInterventionId,
  reducedMotion = false,
  onSelectBarrier,
  onSelectIntervention,
}: BarrierMarkersProps) {
  return (
    <group name="barrier-markers">
      {barriers.map((barrier) => {
        const barrierPin: readonly [number, number, number] = [
          barrier.position[0],
          barrier.position[1] + 0.78,
          barrier.position[2],
        ];
        const interventionPin: readonly [number, number, number] = [
          barrier.position[0] - 0.78,
          barrier.position[1] + 0.42,
          barrier.position[2] + 0.78,
        ];
        return (
          <group key={barrier.id}>
            <Pin
              position={barrierPin}
              label={barrier.label}
              selected={selectedBarrierId === barrier.id}
              reducedMotion={reducedMotion}
              onClick={() => onSelectBarrier?.(barrier.id)}
            />
            {barrier.interventionId && (
              <Pin
                position={interventionPin}
                label="Ramp"
                selected={selectedInterventionId === barrier.interventionId}
                reducedMotion={reducedMotion}
                onClick={() => {
                  if (barrier.interventionId) onSelectIntervention?.(barrier.interventionId);
                }}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
