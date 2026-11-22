import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { IssueKind } from "../../../shared/issues.ts";
import { selectIssue, useIssueState, type SceneIssue } from "../issueStore";

/** Marker color per kind of issue; improved issues turn green. */
export const ISSUE_COLOR: Record<IssueKind, string> = {
  stairs: "#ff8a3d",
  unmarked_crossing: "#ffd23f",
  no_sidewalk: "#ff5d73",
  unpaved_path: "#c98b4a",
};
const FIXED = "#2ecc71";
const LOGO_BLUE = "#1488ff";
const ROAD_HALF = 0.62;

/** A flat band along a path, `offset` to one side, as one geometry. */
function band(path: readonly [number, number][], half: number, y: number, offset = 0) {
  const positions: number[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const nx = -dz / len;
    const nz = dx / len;
    const l = offset - half;
    const r = offset + half;
    const aL = [ax + nx * l, y, az + nz * l];
    const aR = [ax + nx * r, y, az + nz * r];
    const bL = [bx + nx * l, y, bz + nz * l];
    const bR = [bx + nx * r, y, bz + nz * r];
    positions.push(...aL, ...bL, ...aR, ...aR, ...bL, ...bR);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Evenly spaced points along a path with their heading. */
function stations(path: readonly [number, number][], spacing: number) {
  const out: { x: number; z: number; rot: number }[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    for (let t = spacing / 2; t < len; t += spacing) {
      out.push({ x: ax + ((bx - ax) * t) / len, z: az + ((bz - az) * t) / len, rot });
    }
  }
  return out;
}

function Band({
  path,
  half,
  y,
  offset = 0,
  color,
  glow = 0,
}: {
  path: readonly [number, number][];
  half: number;
  y: number;
  offset?: number;
  color: string;
  glow?: number;
}) {
  const geometry = useMemo(() => band(path, half, y, offset), [path, half, y, offset]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow raycast={() => null}>
      <meshStandardMaterial
        color={color}
        emissive={glow > 0 ? color : "#000000"}
        emissiveIntensity={glow}
        roughness={0.8}
        side={THREE.DoubleSide}
        toneMapped={glow === 0}
      />
    </mesh>
  );
}

/** Bars across a path: stair treads before, zebra stripes after. */
function Bars({
  path,
  spacing,
  depth,
  width,
  color,
  y,
}: {
  path: readonly [number, number][];
  spacing: number;
  depth: number;
  width: number;
  color: string;
  y: number;
}) {
  const spots = useMemo(() => stations(path, spacing), [path, spacing]);
  return (
    <group>
      {spots.map((spot, i) => (
        <mesh key={i} position={[spot.x, y, spot.z]} rotation={[0, spot.rot, 0]} raycast={() => null}>
          <boxGeometry args={[width, 0.03, depth]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** What the street looks like today (only where it reads in 3D). */
function Before({ issue }: { issue: SceneIssue }) {
  if (issue.kind === "stairs") {
    return <Bars path={issue.path} spacing={0.18} depth={0.08} width={0.42} color="#59636a" y={0.07} />;
  }
  if (issue.kind === "unpaved_path") {
    return <Band path={issue.path} half={0.2} y={0.045} color="#9a7550" />;
  }
  return null;
}

/** What the street looks like once improved. */
function After({ issue }: { issue: SceneIssue }) {
  switch (issue.kind) {
    case "stairs":
      return (
        <group>
          <Band path={issue.path} half={0.26} y={0.12} color="#eef2f4" />
          <Band path={issue.path} half={0.025} y={0.2} offset={0.27} color={LOGO_BLUE} glow={0.8} />
          <Band path={issue.path} half={0.025} y={0.2} offset={-0.27} color={LOGO_BLUE} glow={0.8} />
        </group>
      );
    case "unmarked_crossing":
      return <Bars path={issue.path} spacing={0.34} depth={0.17} width={1.2} color="#ffffff" y={0.09} />;
    case "no_sidewalk": {
      const offsets =
        issue.sides === "both"
          ? [ROAD_HALF + 0.32, -(ROAD_HALF + 0.32)]
          : issue.sides === "left"
            ? [ROAD_HALF + 0.32]
            : [-(ROAD_HALF + 0.32)];
      return (
        <group>
          {offsets.map((offset) => (
            <Band key={offset} path={issue.path} half={0.22} y={0.06} offset={offset} color="#e3e6e2" />
          ))}
        </group>
      );
    }
    case "unpaved_path":
      return <Band path={issue.path} half={0.24} y={0.06} color="#ece7dc" />;
  }
}

function Marker({ issue, fixed, selected }: { issue: SceneIssue; fixed: boolean; selected: boolean }) {
  const color = fixed ? FIXED : ISSUE_COLOR[issue.kind];
  const scale = selected ? 1.5 : 1;
  return (
    <group position={[issue.x, 0, issue.z]}>
      <group scale={scale}>
        <mesh position={[0, 0.7, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.025, 0.025, 1.4, 6]} />
          <meshStandardMaterial color="#e9edef" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.6, 0]} raycast={() => null}>
          <octahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} toneMapped={false} />
        </mesh>
        {/* A generous invisible target so the marker is easy to click. */}
        <mesh
          position={[0, 1.4, 0]}
          onClick={(event) => {
            event.stopPropagation();
            selectIssue(issue.id, { openImprove: true });
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <sphereGeometry args={[0.55, 8, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} raycast={() => null}>
          <ringGeometry args={[0.7, 0.85, 32]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Accessibility issues on the map: a marker over each one, the street as it
 * is today, and the fix once the resident improves it. Click a marker to
 * open it in Improve.
 */
export function IssueLayer() {
  const { issues, fixed: improved, selectedId, showBefore } = useIssueState();
  // Compare's "Today" view hides every fix so the change is easy to see.
  const fixed = showBefore ? new Set<string>() : improved;
  const selected = issues.find((issue) => issue.id === selectedId) ?? null;
  return (
    <group name="issues">
      {issues.map((issue) =>
        fixed.has(issue.id) ? (
          <After key={`after-${issue.id}`} issue={issue} />
        ) : (
          <Before key={`before-${issue.id}`} issue={issue} />
        ),
      )}
      {selected && (
        // Light up exactly which stretch the selected issue covers.
        <Band path={selected.path} half={0.08} y={0.16} color={LOGO_BLUE} glow={1.1} />
      )}
      {issues.map((issue) => (
        <Marker key={issue.id} issue={issue} fixed={fixed.has(issue.id)} selected={issue.id === selectedId} />
      ))}
    </group>
  );
}
