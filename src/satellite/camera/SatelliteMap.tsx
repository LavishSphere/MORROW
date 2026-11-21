import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import blueMarkUrl from "../../brand/morrow-logo-blue.png";
import type { CameraFrame } from "./useTownCamera";
import { lngLatToWorld } from "./project";
import type { ProblemKind } from "../pins/demoProblems";

const IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const WORLD_ZOOM = 17;
const TILE = 256;

export type MapProblem = {
  id: string;
  longitude: number;
  latitude: number;
  title: string;
  kind: ProblemKind;
};

type Props = {
  frame: CameraFrame;
  problems: readonly MapProblem[];
  selectedId: string | null;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
};

const textureCache = new Map<string, THREE.Texture>();

function worldPoint(lng: number, lat: number) {
  const point = lngLatToWorld(lng, lat, WORLD_ZOOM);
  return { x: point.x, z: point.y };
}

function MapCamera({ frame }: { frame: CameraFrame }) {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    const focus = worldPoint(frame.lng, frame.lat);
    const closeness = THREE.MathUtils.clamp((frame.zoom - 14.2) / 4.2, 0, 1);
    const height = THREE.MathUtils.lerp(980, 150, closeness);
    const back = height * 1.65;
    camera.position.set(focus.x, height, focus.z + back);
    camera.lookAt(focus.x, 0, focus.z);
  });
  return null;
}

function TileGround({ frame }: { frame: CameraFrame }) {
  const [revision, setRevision] = useState(0);
  const focus = worldPoint(frame.lng, frame.lat);
  const tx = Math.floor(focus.x / TILE);
  const ty = Math.floor(focus.z / TILE);
  const tiles = useMemo(() => {
    const list: { x: number; y: number }[] = [];
    for (let y = ty - 3; y <= ty + 3; y += 1) {
      for (let x = tx - 3; x <= tx + 3; x += 1) {
        if (y >= 0) list.push({ x, y });
      }
    }
    return list;
  }, [tx, ty]);

  useEffect(() => {
    let alive = true;
    for (const tile of tiles) {
      const n = 2 ** WORLD_ZOOM;
      const wrappedX = ((tile.x % n) + n) % n;
      const url = `${IMAGERY}/${WORLD_ZOOM}/${tile.y}/${wrappedX}`;
      if (textureCache.get(url)?.image) continue;
      new THREE.TextureLoader().load(url, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        textureCache.set(url, texture);
        if (alive) setRevision((value) => value + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, [tiles]);
  void revision;

  return (
    <group>
      {tiles.map((tile) => {
        const n = 2 ** WORLD_ZOOM;
        const wrappedX = ((tile.x % n) + n) % n;
        const map = textureCache.get(`${IMAGERY}/${WORLD_ZOOM}/${tile.y}/${wrappedX}`);
        if (!map) return null;
        return (
          <mesh
            key={`${tile.x}/${tile.y}`}
            position={[(tile.x + 0.5) * TILE, 0, (tile.y + 0.5) * TILE]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[TILE, TILE]} />
            <meshBasicMaterial map={map} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function useFixProgress(selectedId: string | null, reducedMotion: boolean) {
  const [progress, setProgress] = useState(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let raf = 0;
    const start = performance.now() + 650;
    const duration = 1600;
    const tick = (now: number) => {
      const next = Math.min(1, Math.max(0, (now - start) / duration));
      setProgress(next);
      if (next < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, selectedId]);
  return progress;
}

const rampGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-18, 0);
  shape.lineTo(18, 0);
  shape.lineTo(18, 10);
  shape.lineTo(-18, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 28, bevelEnabled: false });
  geometry.translate(0, 0, -14);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
})();

function FixModel({ kind, progress }: { kind: ProblemKind; progress: number }) {
  if (kind === "pothole") {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
          <circleGeometry args={[16, 24]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.8, 0]}
          scale={Math.max(0.05, progress)}
        >
          <circleGeometry args={[17, 24]} />
          <meshStandardMaterial color="#4c4c4c" />
        </mesh>
      </group>
    );
  }
  if (kind === "sidewalk") {
    const gap = (1 - progress) * 6;
    return (
      <group>
        <mesh position={[-10, 3, -gap]}>
          <boxGeometry args={[18, 6, 16]} />
          <meshStandardMaterial color="#d9d9d9" />
        </mesh>
        <mesh position={[10, 3 + gap, gap]}>
          <boxGeometry args={[18, 6, 16]} />
          <meshStandardMaterial color="#c8c8c8" />
        </mesh>
      </group>
    );
  }
  if (kind === "crossing") {
    return (
      <group>
        <mesh position={[0, 8 * (1 - progress), 0]}>
          <boxGeometry args={[34, 14, 8]} />
          <meshStandardMaterial color="#f4f4f4" transparent opacity={1 - progress} />
        </mesh>
        {[-8, 0, 8].map((z) => (
          <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, z]}>
            <planeGeometry args={[26, 3]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={progress} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 6, 0]} scale={[1, Math.max(0.08, 1 - progress), 1]}>
        <boxGeometry args={[16, 12, 36]} />
        <meshStandardMaterial color="#ececec" />
      </mesh>
      <mesh geometry={rampGeometry} position={[0, 0.2, 0]} scale={[1, Math.max(0.05, progress), 1]}>
        <meshStandardMaterial color="#f7f7f7" />
      </mesh>
    </group>
  );
}

function ProblemMarker({
  problem,
  selected,
  progress,
  onSelect,
}: {
  problem: MapProblem;
  selected: boolean;
  progress: number;
  onSelect: (id: string) => void;
}) {
  const point = worldPoint(problem.longitude, problem.latitude);
  const mark = useTexture(blueMarkUrl);
  return (
    <group name={problem.title} position={[point.x, 0, point.z]}>
      {selected ? (
        <group scale={6}>
          <FixModel kind={problem.kind} progress={progress} />
        </group>
      ) : (
        <sprite
          position={[0, 40, 0]}
          scale={[70, 70, 1]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(problem.id);
          }}
        >
          <spriteMaterial map={mark} transparent depthWrite={false} toneMapped={false} />
        </sprite>
      )}
    </group>
  );
}

function Scene({
  frame,
  problems,
  selectedId,
  reducedMotion,
  onSelect,
}: Props) {
  const progress = useFixProgress(selectedId, reducedMotion);
  return (
    <>
      <MapCamera frame={frame} />
      <hemisphereLight args={["#ffffff", "#222222", 1.1]} />
      <directionalLight position={[120, 240, 80]} intensity={1.4} />
      <TileGround frame={frame} />
      {problems.map((problem) => (
        <ProblemMarker
          key={problem.id}
          problem={problem}
          selected={problem.id === selectedId}
          progress={progress}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

/** Tilted Esri map. The selected problem plays its fix in the scene. */
export function SatelliteMap(props: Props) {
  return (
    <div className="satellite-stage">
      <Canvas
        className="satellite-stage__canvas"
        camera={{ fov: 46, near: 1, far: 12000, position: [0, 900, 900] }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <color attach="background" args={["#000000"]} />
          <Scene {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
