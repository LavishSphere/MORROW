import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import basemap from "../../data/wellesley/basemap.geojson";
import { generateProposal } from "../data/api";
import { SCENARIO } from "../data/fixtures";
import { defaultProjector } from "../showcase/layout";
import { parseBasemap } from "../showcase/scene/parseBasemap";
import {
  createExtrudedBuilding,
  createRibbonGeometry,
} from "../showcase/scene/ribbonGeometry";
import "./city.css";

type Kind = "ramp" | "pothole" | "sidewalk" | "crossing";

type Issue = {
  id: string;
  longitude: number;
  latitude: number;
  title: string;
  kind: Kind;
  fix: string;
};

const ISSUES: readonly Issue[] = [
  {
    id: "wellesley-barrier-campus-path-01",
    longitude: -71.3078763,
    latitude: 42.2931263,
    title: "Missing curb ramp",
    kind: "ramp",
    fix: "Replace the curb with a ramp so the footway meets the street.",
  },
  {
    id: "illustrative-pothole",
    longitude: -71.3051,
    latitude: 42.2954,
    title: "Pothole",
    kind: "pothole",
    fix: "Fill the pothole so the lane is even again.",
  },
  {
    id: "illustrative-blocked-crossing",
    longitude: -71.3012,
    latitude: 42.2947,
    title: "Blocked crossing",
    kind: "crossing",
    fix: "Clear the crossing and open the curb ramp.",
  },
  {
    id: "illustrative-broken-sidewalk",
    longitude: -71.3038,
    latitude: 42.2918,
    title: "Broken sidewalk",
    kind: "sidewalk",
    fix: "Level the broken slabs into one continuous sidewalk.",
  },
];

const GROUND = "#062833";
const GLASS = "#9aebff";
const GLOW = "#d8fbff";

function place(issue: Issue): [number, number, number] {
  const [x, y, z] = defaultProjector.project3(issue.longitude, issue.latitude, 0.08);
  return [x, y, z];
}

function FlyCamera() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const keys = useRef<Record<string, boolean>>({});
  const look = useRef({ yaw: 0.85, pitch: -0.48 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    camera.position.set(7.2, 5.4, 8.6);
    const element = gl.domElement;
    const down = (event: PointerEvent) => {
      if (event.button !== 2 && event.button !== 1) return;
      drag.current = { x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current = { x: event.clientX, y: event.clientY };
      look.current.yaw -= dx * 0.005;
      look.current.pitch = Math.max(-1.15, Math.min(0.55, look.current.pitch - dy * 0.004));
    };
    const up = () => {
      drag.current = null;
    };
    const key = (event: KeyboardEvent) => {
      keys.current[event.code] = event.type === "keydown";
    };
    const prevent = (event: Event) => event.preventDefault();
    element.addEventListener("pointerdown", down);
    element.addEventListener("contextmenu", prevent);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("contextmenu", prevent);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const { yaw, pitch } = look.current;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const move = new THREE.Vector3();
    if (keys.current.KeyW) move.add(forward);
    if (keys.current.KeyS) move.sub(forward);
    if (keys.current.KeyD) move.add(right);
    if (keys.current.KeyA) move.sub(right);
    if (keys.current.Space) move.y += 1;
    if (keys.current.ShiftLeft || keys.current.ShiftRight) move.y -= 1;
    if (move.lengthSq() > 0) {
      camera.position.add(move.normalize().multiplyScalar(4.2 * delta));
    }
    const gaze = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(camera.position.clone().add(gaze));
  });

  return null;
}

function Ground() {
  const size = Math.max(28, defaultProjector.span * 1.6);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
      <circleGeometry args={[size * 0.62, 72]} />
      <meshStandardMaterial color={GROUND} roughness={0.92} metalness={0.08} />
    </mesh>
  );
}

function Buildings() {
  const parsed = useMemo(() => parseBasemap(basemap, defaultProjector), []);
  const buildings = useMemo(() => {
    if (!parsed) return [];
    return parsed.buildings.flatMap((building) => {
      const geometry = createExtrudedBuilding(building.ring, building.height * 1.35);
      return geometry ? [{ id: building.id, geometry }] : [];
    });
  }, [parsed]);
  useEffect(
    () => () => {
      for (const building of buildings) building.geometry.dispose();
    },
    [buildings],
  );
  return (
    <group>
      {buildings.map((building) => (
        <mesh key={building.id} geometry={building.geometry} castShadow raycast={() => null}>
          <meshStandardMaterial
            color={GLASS}
            emissive="#7ad7ff"
            emissiveIntensity={0.45}
            transparent
            opacity={0.42}
            roughness={0.18}
            metalness={0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

function Roads() {
  const parsed = useMemo(() => parseBasemap(basemap, defaultProjector), []);
  const ways = useMemo(() => {
    if (!parsed) return [];
    return parsed.ways.flatMap((way) => {
      const glow = way.layer === "road";
      const geometry = createRibbonGeometry(
        way.points,
        glow ? way.halfWidth * 0.55 : way.halfWidth * 0.35,
        0.03,
        0.015,
      );
      return geometry ? [{ id: way.id, geometry, glow }] : [];
    });
  }, [parsed]);
  useEffect(
    () => () => {
      for (const way of ways) way.geometry.dispose();
    },
    [ways],
  );
  return (
    <group>
      {ways.map((way) => (
        <mesh key={way.id} geometry={way.geometry} raycast={() => null}>
          <meshStandardMaterial
            color={way.glow ? "#163a46" : "#0e2c36"}
            emissive={way.glow ? "#9aebff" : "#4ec4d4"}
            emissiveIntensity={way.glow ? 0.85 : 0.35}
            roughness={0.35}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  );
}

function Trees() {
  const parsed = useMemo(() => parseBasemap(basemap, defaultProjector), []);
  const spots = useMemo(() => {
    if (!parsed) return [];
    return parsed.buildings
      .filter((_, index) => index % 4 === 0)
      .map((building) => {
        const [x, z] = building.ring[0] ?? [0, 0];
        return { id: building.id, x: x + 0.35, z: z + 0.25 };
      });
  }, [parsed]);
  return (
    <group>
      {spots.map((spot, index) => {
        const autumn = index % 3 === 0;
        return (
          <group key={spot.id} position={[spot.x, 0, spot.z]}>
            <mesh position={[0, 0.18, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.04, 0.05, 0.36, 6]} />
              <meshStandardMaterial color="#d7efe8" />
            </mesh>
            <mesh position={[0, 0.48, 0]} raycast={() => null}>
              <sphereGeometry args={[0.22, 10, 8]} />
              <meshStandardMaterial
                color={autumn ? "#e2a24a" : "#7dcea0"}
                emissive={autumn ? "#c9842e" : "#3d9a62"}
                emissiveIntensity={0.25}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function IssueMarker({
  issue,
  selected,
  progress,
  onSelect,
}: {
  issue: Issue;
  selected: boolean;
  progress: number;
  onSelect: (id: string) => void;
}) {
  const [x, y, z] = place(issue);
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(issue.id);
  };
  return (
    <group position={[x, y, z]} onClick={click}>
      <mesh position={[0, 0.55, 0]}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial
          color="#1488ff"
          emissive="#1488ff"
          emissiveIntensity={selected ? 1.1 : 0.55}
        />
      </mesh>
      {selected && issue.kind === "ramp" && (
        <group>
          <mesh position={[0, 0.16 * (1 - progress), 0]} scale={[0.34, 0.22 * (1 - progress) + 0.02, 0.7]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#f4f7f8" />
          </mesh>
          <mesh position={[0.22, 0.06, 0]} rotation={[0, 0, -0.55 * progress]} scale={[0.55, 0.08 + 0.16 * progress, 0.7]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#ffffff" emissive="#d8fbff" emissiveIntensity={0.2} />
          </mesh>
        </group>
      )}
      {selected && issue.kind === "pothole" && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <circleGeometry args={[0.28, 18]} />
            <meshStandardMaterial color="#102028" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} scale={Math.max(0.04, progress)}>
            <circleGeometry args={[0.3, 18]} />
            <meshStandardMaterial color="#5d6b72" />
          </mesh>
        </group>
      )}
      {selected && issue.kind === "sidewalk" && (
        <group>
          <mesh position={[-0.16, 0.08, -(1 - progress) * 0.12]}>
            <boxGeometry args={[0.28, 0.08, 0.22]} />
            <meshStandardMaterial color="#e7eef0" />
          </mesh>
          <mesh position={[0.16, 0.08 + (1 - progress) * 0.1, (1 - progress) * 0.12]}>
            <boxGeometry args={[0.28, 0.08, 0.22]} />
            <meshStandardMaterial color="#d5e4e8" />
          </mesh>
        </group>
      )}
      {selected && issue.kind === "crossing" && (
        <group>
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
      )}
    </group>
  );
}

function Scene({
  selectedId,
  progress,
  onSelect,
}: {
  selectedId: string;
  progress: number;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <color attach="background" args={["#071820"]} />
      <fog attach="fog" args={["#0b2430", 12, 32]} />
      <hemisphereLight args={["#b7fff2", "#062028", 0.85]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 4]} intensity={1.15} color="#e9fffb" />
      <FlyCamera />
      <Ground />
      <Roads />
      <Buildings />
      <Trees />
      {ISSUES.map((issue) => (
        <IssueMarker
          key={issue.id}
          issue={issue}
          selected={issue.id === selectedId}
          progress={progress}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

type Props = {
  reducedMotion: boolean;
};

/** Cartoon Wellesley. Fly like a spectator, click a road issue, watch the fix. */
export function CartoonCity({ reducedMotion }: Props) {
  const [selectedId, setSelectedId] = useState(ISSUES[0].id);
  const [token, setToken] = useState(0);
  const [progress, setProgress] = useState(reducedMotion ? 1 : 0);
  const [proposal, setProposal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = ISSUES.find((issue) => issue.id === selectedId) ?? ISSUES[0];

  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    setProgress(0);
    setProposal(null);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / 1500);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, selectedId, token]);

  const choose = (id: string) => {
    setSelectedId(id);
    setToken((value) => value + 1);
  };

  const next = () => {
    const index = ISSUES.findIndex((issue) => issue.id === selectedId);
    choose(ISSUES[(index + 1) % ISSUES.length].id);
  };

  const propose = async () => {
    setBusy(true);
    try {
      if (selected.id === SCENARIO.barrierId) {
        const result = await generateProposal({
          scenarioId: SCENARIO.id,
          barrierId: SCENARIO.barrierId,
          interventionId: SCENARIO.interventionId,
        });
        setProposal(result.draft.plainLanguageSummary);
      } else {
        setProposal(
          `${selected.fix} This is an illustrative Wellesley proposal, not a field survey.`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cartoon-city">
      <Canvas
        camera={{ fov: 52, near: 0.05, far: 80, position: [7.2, 5.4, 8.6] }}
        gl={{ antialias: true }}
        dpr={[1, 1.5]}
      >
        <Scene selectedId={selectedId} progress={progress} onSelect={choose} />
      </Canvas>
      <div className="cartoon-city__hud">
        <p className="cartoon-city__hint">
          Right-drag to look · WASD flies · Space up · Shift down · Click a blue issue
        </p>
        <div className="cartoon-city__card">
          <p className="cartoon-city__title">{selected.title}</p>
          <p className="cartoon-city__fix">{progress < 1 ? "Watch the street change." : selected.fix}</p>
          <div className="cartoon-city__actions">
            <button type="button" onClick={next}>
              See next problem
            </button>
            <button type="button" onClick={() => void propose()} disabled={progress < 1 || busy}>
              {busy ? "Writing proposal…" : "Generate proposal"}
            </button>
          </div>
          {proposal ? <p className="cartoon-city__proposal">{proposal}</p> : null}
        </div>
      </div>
    </div>
  );
}
