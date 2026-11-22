import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { flyTo, useCityState } from "../cityStore";
import { selectIssue, useIssueState, type SceneIssue } from "../issueStore";
import {
  buildProgress,
  clusterCell,
  clusterPins,
  FIXED_COLOR,
  ISSUE_COLOR,
  ISSUE_SEVERITY,
  ISSUE_SHAPE,
  ISSUE_SHORT,
  labelIds,
  markerScale,
  mergeFlat,
  PATCH_LABEL,
  patchMesh,
  problemMesh,
  PROPOSED_COLOR,
  stretchMesh,
  todayMesh,
  type FlatMesh,
  type IssueShape,
  type Pin,
  type PinInput,
} from "../issueVisuals";
import { peopleNear } from "../people";
import { HappyCrowd } from "./HappyCrowd";

export { ISSUE_COLOR } from "../issueVisuals";

/** Seconds a fix takes to build itself along the street. */
const BUILD_SECONDS = 1.1;

/** A flat triangle soup with a color per vertex, facing up. */
function useFlatGeometry(mesh: FlatMesh) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(mesh.colors, 3));
    const normals = new Float32Array(mesh.positions.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    return g;
  }, [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** Every open issue's stretch as a dashed line in its colour, in one draw call. */
function ProblemStretches({ issues }: { issues: SceneIssue[] }) {
  const mesh = useMemo(() => mergeFlat(issues.map((issue) => problemMesh(issue))), [issues]);
  const geometry = useFlatGeometry(mesh);
  if (mesh.positions.length === 0) return null;
  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={2}>
      <meshBasicMaterial vertexColors toneMapped={false} transparent opacity={0.92} depthWrite={false} />
    </mesh>
  );
}

/** What reads in 3D today: stair treads and dirt paths, in one draw call. */
function TodayDetails({ issues }: { issues: SceneIssue[] }) {
  const mesh = useMemo(() => mergeFlat(issues.map((issue) => todayMesh(issue))), [issues]);
  const geometry = useFlatGeometry(mesh);
  if (mesh.positions.length === 0) return null;
  return (
    <mesh geometry={geometry} receiveShadow raycast={() => null}>
      <meshStandardMaterial vertexColors roughness={0.8} />
    </mesh>
  );
}

/**
 * The proposed fix, built from the issue's own way. It builds itself along
 * the street when it appears. A preview (not improved yet) is a pulsing
 * blue ghost; an improved fix is solid with glowing blue trim.
 */
function Patch({ issue, preview, reducedMotion }: { issue: SceneIssue; preview: boolean; reducedMotion: boolean }) {
  const parts = useMemo(() => patchMesh(issue), [issue]);
  const surface = useFlatGeometry(parts.surface);
  const edges = useFlatGeometry(parts.edges);
  const surfaceLook = useRef<THREE.MeshStandardMaterial>(null);
  const edgeLook = useRef<THREE.MeshBasicMaterial>(null);
  const started = useRef<number | null>(null);
  const built = useRef(false);

  useFrame(({ clock }) => {
    if (!built.current) {
      started.current ??= clock.elapsedTime;
      const k = buildProgress(clock.elapsedTime - started.current, BUILD_SECONDS, reducedMotion);
      // Whole quads only (6 vertices), so the build edge is clean.
      const reveal = (g: THREE.BufferGeometry) => {
        const quads = g.getAttribute("position").count / 6;
        g.setDrawRange(0, Math.ceil(quads * k) * 6);
      };
      reveal(surface);
      reveal(edges);
      if (k >= 1) built.current = true;
    }
    if (preview && !reducedMotion && surfaceLook.current && edgeLook.current) {
      const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3);
      surfaceLook.current.opacity = 0.45 + 0.25 * pulse;
      edgeLook.current.opacity = 0.6 + 0.4 * pulse;
    }
  });

  return (
    <group name={preview ? "fix-preview" : "fix"}>
      <mesh geometry={surface} receiveShadow={!preview} raycast={() => null} renderOrder={3}>
        <meshStandardMaterial
          ref={surfaceLook}
          vertexColors
          color={preview ? "#8fc6ff" : "#ffffff"}
          emissive={PROPOSED_COLOR}
          emissiveIntensity={preview ? 0.35 : 0.06}
          roughness={0.7}
          transparent={preview}
          opacity={preview ? 0.6 : 1}
          depthWrite={!preview}
        />
      </mesh>
      <mesh geometry={edges} raycast={() => null} renderOrder={4}>
        <meshBasicMaterial ref={edgeLook} vertexColors toneMapped={false} transparent opacity={preview ? 0.8 : 1} />
      </mesh>
    </group>
  );
}

type Mode = "today" | "preview" | "fixed";

const MODE_COLOR = (issue: SceneIssue, mode: Mode) =>
  mode === "today" ? ISSUE_COLOR[issue.kind] : mode === "preview" ? PROPOSED_COLOR : FIXED_COLOR;

/** The selected issue: its whole stretch lit and pulsing, and a ring on the ground at its pin. */
function Selected({ issue, mode, reducedMotion }: { issue: SceneIssue; mode: Mode; reducedMotion: boolean }) {
  const color = MODE_COLOR(issue, mode);
  const mesh = useMemo(
    () => (mode === "today" ? stretchMesh(issue, 0.13, 0.09, color) : { positions: [], colors: [] }),
    [issue, mode, color],
  );
  const geometry = useFlatGeometry(mesh);
  const band = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringLook = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const t = (clock.elapsedTime * 0.8) % 1;
    if (ring.current && ringLook.current) {
      ring.current.scale.setScalar(1 + t * 1.6);
      ringLook.current.opacity = 0.9 * (1 - t);
    }
    if (band.current) band.current.opacity = 0.65 + 0.35 * Math.sin(clock.elapsedTime * 4) ** 2;
  });

  return (
    <group name="selected-issue">
      {mesh.positions.length > 0 && (
        <mesh geometry={geometry} raycast={() => null} renderOrder={5}>
          <meshBasicMaterial ref={band} vertexColors toneMapped={false} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      <group position={[issue.x, 0.1, issue.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh raycast={() => null}>
          <ringGeometry args={[0.7, 0.85, 40]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh ref={ring} raycast={() => null}>
          <ringGeometry args={[0.7, 0.8, 40]} />
          <meshBasicMaterial ref={ringLook} color={color} toneMapped={false} transparent opacity={reducedMotion ? 0 : 0.9} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/** The hovered issue's stretch, solid, so you can see what a pin covers before clicking. */
function Hovered({ issue }: { issue: SceneIssue }) {
  const mesh = useMemo(() => stretchMesh(issue, 0.1, 0.088, ISSUE_COLOR[issue.kind]), [issue]);
  const geometry = useFlatGeometry(mesh);
  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={5}>
      <meshBasicMaterial vertexColors toneMapped={false} transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

const SHAPES: IssueShape[] = ["diamond", "triangle", "square", "circle"];

function headGeometry(shape: IssueShape): THREE.BufferGeometry {
  switch (shape) {
    case "diamond":
      return new THREE.OctahedronGeometry(0.27, 0);
    case "triangle":
      return new THREE.ConeGeometry(0.28, 0.42, 3);
    case "square":
      return new THREE.BoxGeometry(0.38, 0.38, 0.38);
    case "circle":
      return new THREE.SphereGeometry(0.23, 16, 12);
  }
}

/** Pole height by severity: the worst barriers stand tallest. */
const poleHeight = (pin: Pin) => 1.05 + 0.15 * ISSUE_SEVERITY[pin.kind];

type View = { cell: number; labels: string[]; scale: number };

/**
 * One pin per issue, colored and shaped by kind, instanced so hundreds cost
 * a few draw calls. Pins keep about the same size on screen at any zoom;
 * far out, nearby pins merge into one with a count. Zoomed in, the nearest
 * pins get a short label.
 */
function IssuePins({
  issues,
  fixed,
  selectedId,
  peekLabel,
}: {
  issues: SceneIssue[];
  fixed: ReadonlySet<string>;
  selectedId: string | null;
  peekLabel: string | null;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as { target: THREE.Vector3 } | null;
  const [view, setView] = useState<View>({ cell: 0, labels: [], scale: 1 });
  const [hovered, setHovered] = useState<string | null>(null);

  const inputs = useMemo<PinInput[]>(
    () => issues.map((issue) => ({ id: issue.id, kind: issue.kind, x: issue.x, z: issue.z, fixed: fixed.has(issue.id) })),
    [issues, fixed],
  );
  // The selected issue always keeps its own pin, even when the rest cluster.
  const pins = useMemo(() => {
    const rest = clusterPins(
      inputs.filter((input) => input.id !== selectedId),
      view.cell,
    );
    const own = inputs.find((input) => input.id === selectedId);
    return own ? [...clusterPins([own], 0), ...rest] : rest;
  }, [inputs, selectedId, view.cell]);
  const byId = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);

  const capacity = Math.max(1, issues.length);
  const looks = useMemo(() => {
    const head = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
    // Heads glow in their own instance colour, so they read against dark glass.
    head.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * 0.6;",
      );
    };
    return {
      head,
      pole: new THREE.MeshStandardMaterial({ color: "#e9edef", metalness: 0.5, roughness: 0.35 }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      heads: Object.fromEntries(SHAPES.map((shape) => [shape, headGeometry(shape)])) as Record<IssueShape, THREE.BufferGeometry>,
      poleShape: new THREE.CylinderGeometry(0.025, 0.025, 1, 6).translate(0, 0.5, 0),
      hitShape: new THREE.SphereGeometry(0.5, 8, 6),
    };
  }, []);
  useEffect(
    () => () => {
      looks.head.dispose();
      looks.pole.dispose();
      looks.hit.dispose();
      looks.poleShape.dispose();
      looks.hitShape.dispose();
      for (const g of Object.values(looks.heads)) g.dispose();
    },
    [looks],
  );

  const poles = useRef<THREE.InstancedMesh>(null);
  const hits = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<Partial<Record<IssueShape, THREE.InstancedMesh | null>>>({});
  const drawn = useRef({ scale: 0, pins: null as Pin[] | null, hovered: null as string | null });
  const lastCheck = useRef(-1);
  const temp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() }), []);

  useFrame(({ clock }) => {
    const target = controls?.target;
    const distance = target ? camera.position.distanceTo(target) : 60;
    const scale = markerScale(distance);

    // A few times a second: regroup and relabel if the zoom moved enough.
    if (target && clock.elapsedTime - lastCheck.current > 0.25) {
      lastCheck.current = clock.elapsedTime;
      const next: View = {
        cell: clusterCell(distance),
        labels: labelIds(inputs, { x: target.x, z: target.z }, distance),
        scale: Math.round(scale * 10) / 10,
      };
      if (next.cell !== view.cell || next.scale !== view.scale || next.labels.join() !== view.labels.join()) setView(next);
    }

    const d = drawn.current;
    if (d.pins === pins && d.hovered === hovered && Math.abs(d.scale - scale) < 0.004) return;
    d.pins = pins;
    d.hovered = hovered;
    d.scale = scale;
    const counts: Record<IssueShape, number> = { diamond: 0, triangle: 0, square: 0, circle: 0 };
    const { m, q, p, s, c } = temp;
    pins.forEach((pin, i) => {
      const many = pin.ids.length > 1 ? 1 + Math.min(0.6, Math.log2(pin.ids.length) * 0.16) : 1;
      // Focus: the selected pin grows; everything else steps back a little.
      const focus = pin.key === selectedId ? 1.45 : pin.key === hovered ? 1.25 : selectedId ? 0.8 : 1;
      const k = scale * many * focus;
      const h = poleHeight(pin);
      m.compose(p.set(pin.x, 0, pin.z), q, s.set(k, h * k, k));
      poles.current?.setMatrixAt(i, m);
      m.compose(p.set(pin.x, h * k * 0.85, pin.z), q, s.set(k * 1.1, k * 1.5, k * 1.1));
      hits.current?.setMatrixAt(i, m);
      const shape = ISSUE_SHAPE[pin.kind];
      const head = heads.current[shape];
      if (head) {
        m.compose(p.set(pin.x, (h + 0.22) * k, pin.z), q, s.set(k, k, k));
        head.setMatrixAt(counts[shape], m);
        head.setColorAt(counts[shape], c.set(pin.fixed ? FIXED_COLOR : ISSUE_COLOR[pin.kind]));
      }
      counts[shape] += 1;
    });
    for (const mesh of [poles.current, hits.current]) {
      if (!mesh) continue;
      mesh.count = pins.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    for (const shape of SHAPES) {
      const head = heads.current[shape];
      if (!head) continue;
      head.count = counts[shape];
      head.instanceMatrix.needsUpdate = true;
      if (head.instanceColor) head.instanceColor.needsUpdate = true;
    }
  });

  const pinAt = (event: { instanceId?: number }) =>
    event.instanceId === undefined ? null : (pins[event.instanceId] ?? null);

  const hoveredPin = pins.find((pin) => pin.key === hovered) ?? null;
  const hoveredIssue = hoveredPin && hoveredPin.ids.length === 1 && hovered !== selectedId ? byId.get(hovered!) : undefined;
  const labelled = new Set(view.labels);
  if (hoveredIssue) labelled.add(hoveredIssue.id);
  if (selectedId) labelled.delete(selectedId);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const top = (kind: SceneIssue["kind"], focus: number) => (1.05 + 0.15 * ISSUE_SEVERITY[kind] + 0.6) * view.scale * focus;

  return (
    <group name="issue-pins">
      <instancedMesh key={`poles-${capacity}`} ref={poles} args={[looks.poleShape, looks.pole, capacity]} frustumCulled={false} raycast={() => null} />
      {SHAPES.map((shape) => (
        <instancedMesh
          key={`${shape}-${capacity}`}
          ref={(mesh) => {
            heads.current[shape] = mesh;
          }}
          args={[looks.heads[shape], looks.head, capacity]}
          frustumCulled={false}
          raycast={() => null}
        />
      ))}
      {/* Generous invisible targets so pins are easy to hover and click. */}
      <instancedMesh
        key={`hits-${capacity}`}
        ref={hits}
        args={[looks.hitShape, looks.hit, capacity]}
        frustumCulled={false}
        onClick={(event) => {
          const pin = pinAt(event);
          if (!pin) return;
          event.stopPropagation();
          if (pin.ids.length === 1) {
            selectIssue(pin.ids[0]!, { openImprove: true });
          } else {
            // A cluster: zoom in until it splits into its own pins.
            const distance = controls ? camera.position.distanceTo(controls.target) : 120;
            flyTo(pin.x, pin.z, { distance: Math.max(30, distance * 0.45) });
          }
        }}
        onPointerMove={(event) => {
          const pin = pinAt(event);
          if (!pin) return;
          event.stopPropagation();
          document.body.style.cursor = "pointer";
          if (pin.key !== hovered) setHovered(pin.key);
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
          setHovered(null);
        }}
      />
      {hoveredIssue && <Hovered issue={hoveredIssue} />}

      {/* Counts on merged pins, readable from far out. */}
      {pins
        .filter((pin) => pin.ids.length > 1)
        .map((pin) => (
          <Html
            key={pin.key}
            position={[pin.x, top(pin.kind, 1.3), pin.z]}
            center
            zIndexRange={[5, 1]}
            style={{ pointerEvents: "none" }}
          >
            <span className={`issue-pin-count${pin.open === 0 ? " is-fixed" : ""}${pin.key === hovered ? " is-hovered" : ""}`}>
              {pin.open > 0 ? pin.open : `✓ ${pin.ids.length}`}
            </span>
          </Html>
        ))}

      {/* Short labels on the nearest pins when zoomed in. */}
      {[...labelled].map((id) => {
        const issue = byId.get(id);
        if (!issue) return null;
        const done = fixed.has(id);
        return (
          <Html key={id} position={[issue.x, top(issue.kind, 1), issue.z]} center zIndexRange={[5, 1]} style={{ pointerEvents: "none" }}>
            <span className={`issue-tag${done ? " is-fixed" : ""}${id === hovered ? " is-hovered" : ""}`}>
              <span className={`issue-glyph issue-glyph--${ISSUE_SHAPE[issue.kind]}`} style={{ color: done ? FIXED_COLOR : ISSUE_COLOR[issue.kind] }} />
              {done ? PATCH_LABEL[issue.kind] : ISSUE_SHORT[issue.kind]}
            </span>
          </Html>
        );
      })}

      {/* The selected issue says what you are looking at: today, a preview, or the fix. */}
      {selected && (
        <Html position={[selected.x, top(selected.kind, 1.45), selected.z]} center zIndexRange={[6, 1]} style={{ pointerEvents: "none" }}>
          <span className="issue-tag issue-tag--selected">
            <span className="issue-tag__row">
              <span
                className={`issue-glyph issue-glyph--${ISSUE_SHAPE[selected.kind]}`}
                style={{ color: fixed.has(selected.id) ? FIXED_COLOR : ISSUE_COLOR[selected.kind] }}
              />
              <strong>{ISSUE_SHORT[selected.kind]}</strong>
            </span>
            {peekLabel && <span className="issue-tag__status">{peekLabel}</span>}
          </span>
        </Html>
      )}
    </group>
  );
}

/**
 * Accessibility issues on the map. Every open issue has a pin (shape and
 * colour by kind) and its affected stretch dashed on the street. Selecting
 * one lights its stretch and labels it; its fix can be previewed in place,
 * and an improved issue shows the fix built into the street with a happy
 * crowd. Click a pin to open it in Improve.
 */
export function IssueLayer({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const { map } = useCityState();
  const { issues, fixed: improved, selectedId, showBefore, peek } = useIssueState();
  // Compare's "Today" view hides every fix so the change is easy to see.
  const fixed = showBefore ? new Set<string>() : improved;
  const selected = issues.find((issue) => issue.id === selectedId) ?? null;
  // The selected issue follows Improve's Today / With the fix switch; the rest show their fix once improved.
  const peekAfter = !showBefore && peek === "after";
  const showsFix = (issue: SceneIssue) => (issue.id === selectedId ? peekAfter : fixed.has(issue.id));
  const openKey = issues
    .filter((issue) => !showsFix(issue))
    .map((issue) => issue.id)
    .join();

  // Rebuild the merged geometry only when the set of open issues changes.
  const { open, today } = useMemo(() => {
    const ids = new Set(openKey.split(","));
    return {
      open: issues.filter((issue) => ids.has(issue.id)),
      // Stairs stay when a ramp goes in beside them.
      today: issues.filter((issue) => issue.kind === "stairs" || ids.has(issue.id)),
    };
  }, [issues, openKey]);

  const mode: Mode = !selected || !showsFix(selected) ? "today" : improved.has(selected.id) ? "fixed" : "preview";
  const peekLabel = !selected
    ? null
    : mode === "preview"
      ? `Preview: ${PATCH_LABEL[selected.kind]}`
      : mode === "fixed"
        ? `Proposed: ${PATCH_LABEL[selected.kind]}`
        : improved.has(selected.id)
          ? "Today, before your fix"
          : "Today: affected stretch lit";

  return (
    <group name="issues">
      <TodayDetails issues={today} />
      <ProblemStretches issues={open} />
      {issues.filter(showsFix).map((issue) => (
        // Keyed by preview too, so pressing Improve builds the real fix over the preview.
        <Patch key={`fix-${issue.id}-${fixed.has(issue.id) ? "real" : "preview"}`} issue={issue} preview={!fixed.has(issue.id)} reducedMotion={reducedMotion} />
      ))}
      {selected && <Selected key={selected.id} issue={selected} mode={mode} reducedMotion={reducedMotion} />}
      <IssuePins issues={issues} fixed={fixed} selectedId={selectedId} peekLabel={peekLabel} />
      {/* A happy crowd gathers at every fix; bigger where more people live nearby. */}
      {issues
        .filter((issue) => fixed.has(issue.id))
        .filter((issue) => showsFix(issue))
        .map((issue) => {
          const people = map ? peopleNear(map, issue.x, issue.z) : 0;
          return (
            <HappyCrowd
              key={`crowd-${issue.id}`}
              x={issue.x}
              z={issue.z}
              count={Math.max(4, Math.min(12, 3 + Math.round(people / 12)))}
              wheelchair={issue.kind === "stairs" || issue.kind === "unmarked_crossing"}
              seed={Math.abs(issue.x * 0.013 + issue.z * 0.017) + 0.1}
              reducedMotion={reducedMotion}
            />
          );
        })}
    </group>
  );
}
