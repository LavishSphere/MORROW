import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useState } from "react";
import { LOGO_BLUE } from "../../showcase/palette";
import { ISSUES, place, type Issue } from "./issues";

const GLOW = "#d8fbff";

export type IssueSelect = (id: string) => void;

export type IssueMarkerProps = {
  issue: Issue;
  /** True while this issue is the one the city is fixing. */
  selected: boolean;
  /**
   * Fix playback from 0 (the problem) to 1 (fixed).
   * The city owns this number. Reduced motion passes 1 immediately.
   */
  progress: number;
  /** Click reports the issue id so the city can play the fix. */
  onSelect: IssueSelect;
};

export type IssueMarkersProps = {
  selectedId: string | null;
  progress: number;
  onSelect: IssueSelect;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function CurbToRamp({ progress }: { progress: number }) {
  return (
    <group name="fix-ramp">
      <mesh
        position={[0, 0.16 * (1 - progress), 0]}
        scale={[0.34, 0.22 * (1 - progress) + 0.02, 0.7]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f4f7f8" />
      </mesh>
      <mesh
        position={[0.22, 0.06, 0]}
        rotation={[0, 0, -0.55 * progress]}
        scale={[0.55, 0.08 + 0.16 * progress, 0.7]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" emissive={GLOW} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function PotholeFill({ progress }: { progress: number }) {
  return (
    <group name="fix-pothole">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[0.28, 18]} />
        <meshStandardMaterial color="#102028" />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.07, 0]}
        scale={Math.max(0.04, progress)}
      >
        <circleGeometry args={[0.3, 18]} />
        <meshStandardMaterial color="#5d6b72" />
      </mesh>
    </group>
  );
}

function SidewalkLevel({ progress }: { progress: number }) {
  const gap = 1 - progress;
  return (
    <group name="fix-sidewalk">
      <mesh position={[-0.16, 0.08, -gap * 0.12]}>
        <boxGeometry args={[0.28, 0.08, 0.22]} />
        <meshStandardMaterial color="#e7eef0" />
      </mesh>
      <mesh position={[0.16, 0.08 + gap * 0.1, gap * 0.12]}>
        <boxGeometry args={[0.28, 0.08, 0.22]} />
        <meshStandardMaterial color="#d5e4e8" />
      </mesh>
    </group>
  );
}

function CrossingOpen({ progress }: { progress: number }) {
  return (
    <group name="fix-crossing">
      <mesh position={[0, 0.2 * (1 - progress) + 0.05, 0]}>
        <boxGeometry args={[0.7, 0.22, 0.12]} />
        <meshStandardMaterial color="#f7f7f7" transparent opacity={1 - progress * 0.85} />
      </mesh>
      {[-0.12, 0, 0.12].map((offset) => (
        <mesh key={offset} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, offset]}>
          <planeGeometry args={[0.55, 0.05]} />
          <meshBasicMaterial color={GLOW} transparent opacity={progress} />
        </mesh>
      ))}
    </group>
  );
}

function Fix({ issue, progress }: { issue: Issue; progress: number }) {
  switch (issue.kind) {
    case "ramp":
      return <CurbToRamp progress={progress} />;
    case "pothole":
      return <PotholeFill progress={progress} />;
    case "sidewalk":
      return <SidewalkLevel progress={progress} />;
    case "crossing":
      return <CrossingOpen progress={progress} />;
  }
}

/** Blue pick target for one street issue. Click calls `onSelect` with the issue id. */
export function IssueMarker({ issue, selected, progress, onSelect }: IssueMarkerProps) {
  const [hot, setHot] = useState(false);
  useCursor(hot);
  const [x, y, z] = place(issue);
  const played = clamp01(progress);

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(issue.id);
  };

  return (
    <group
      name={issue.id}
      position={[x, y, z]}
      onClick={select}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHot(true);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setHot(false);
      }}
    >
      <mesh position={[0, 0.55, 0]}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial
          color={LOGO_BLUE}
          emissive={LOGO_BLUE}
          emissiveIntensity={selected ? 1.1 : hot ? 0.8 : 0.55}
        />
      </mesh>
      {selected ? <Fix issue={issue} progress={played} /> : null}
    </group>
  );
}

/** Every street issue. The city passes playback and receives clicks. */
export function IssueMarkers({ selectedId, progress, onSelect }: IssueMarkersProps) {
  return (
    <group name="issue-markers">
      {ISSUES.map((issue) => (
        <IssueMarker
          key={issue.id}
          issue={issue}
          selected={issue.id === selectedId}
          progress={issue.id === selectedId ? progress : 0}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
