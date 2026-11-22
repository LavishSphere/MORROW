import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { RailNetwork, Station } from "../../data/rail.ts";
import { buildRailGeometry, disposeRail } from "./railGeometry";

type GeoBounds = { west: number; south: number; east: number; north: number };

/** Ties and station labels appear once the camera is this close to what it looks at. */
const ZOOMED_IN = 55;
/** Ties are instanced only within this radius of the view center. */
const TIE_RADIUS = 20;
const MAX_TIES = 3000;
/** Station labels: this near the view center, nearest first, at most MAX_LABELS. */
const LABEL_RADIUS = 36;
const MAX_LABELS = 8;

type Controls = { target: THREE.Vector3 } | null;

/** Ties near the camera only: a whole network of them would be millions of triangles. */
function Ties({ ties }: { ties: Float32Array }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as Controls;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(0.045, 0.024, 0.34), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5d5248", roughness: 0.9 }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const last = useRef({ t: -1, x: NaN, z: NaN, ties: null as Float32Array | null, shown: false });

  useFrame(({ clock }) => {
    const m = mesh.current;
    const target = controls?.target;
    if (!m || !target) return;
    const memo = last.current;
    if (clock.elapsedTime - memo.t < 0.25) return;
    memo.t = clock.elapsedTime;
    const near = camera.position.distanceTo(target) < ZOOMED_IN;
    if (!near) {
      if (memo.shown) {
        m.count = 0;
        memo.shown = false;
      }
      return;
    }
    if (memo.shown && memo.ties === ties && Math.hypot(target.x - memo.x, target.z - memo.z) < 3) return;
    memo.x = target.x;
    memo.z = target.z;
    memo.ties = ties;
    memo.shown = true;
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    let count = 0;
    for (let i = 0; i < ties.length && count < MAX_TIES; i += 4) {
      const x = ties[i]!;
      const z = ties[i + 2]!;
      if (Math.abs(x - target.x) > TIE_RADIUS || Math.abs(z - target.z) > TIE_RADIUS) continue;
      q.setFromAxisAngle(up, ties[i + 3]!);
      matrix.compose(p.set(x, ties[i + 1]!, z), q, one);
      m.setMatrixAt(count, matrix);
      count += 1;
    }
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, MAX_TIES]}
      count={0}
      frustumCulled={false}
      receiveShadow
      raycast={() => null}
    />
  );
}

/** A slim post with a round sign on top at each station; a small kiosk at each entrance. */
function StationMarkers({ stations }: { stations: readonly Station[] }) {
  const parts = useMemo(() => {
    const post = new THREE.CylinderGeometry(0.025, 0.03, 1.0, 6).translate(0, 0.5, 0);
    const sign = new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20).rotateX(Math.PI / 2).translate(0, 1.12, 0);
    const kiosk = new THREE.BoxGeometry(0.26, 0.2, 0.34).translate(0, 0.1, 0);
    return {
      post,
      sign,
      kiosk,
      steel: new THREE.MeshStandardMaterial({ color: "#3a4046", metalness: 0.5, roughness: 0.4 }),
      face: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.35 }),
      entrance: new THREE.MeshStandardMaterial({ color: "#24563f", roughness: 0.6 }),
    };
  }, []);
  useEffect(
    () => () => {
      for (const item of Object.values(parts)) item.dispose();
    },
    [parts],
  );
  const meshes = useMemo(() => {
    const stops = stations.filter((s) => !s.entrance);
    const doors = stations.filter((s) => s.entrance);
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, items: readonly Station[]) => {
      const m = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
      m.count = items.length;
      const matrix = new THREE.Matrix4();
      items.forEach((s, i) => m.setMatrixAt(i, matrix.makeTranslation(s.x, 0, s.z)));
      m.castShadow = true;
      m.raycast = () => null;
      return m;
    };
    return [
      make(parts.post, parts.steel, stops),
      make(parts.sign, parts.face, stops),
      make(parts.kiosk, parts.entrance, doors),
    ];
  }, [stations, parts]);
  useEffect(
    () => () => {
      for (const m of meshes) m.dispose();
    },
    [meshes],
  );
  return (
    <group name="rail-stations">
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

/**
 * Station names with line-colour chips, near the view and only when zoomed
 * in. Checked a few times a second, not per frame (like street signs).
 */
function StationLabels({ stations, mark }: { stations: readonly Station[]; mark: string }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as Controls;
  const named = useMemo(() => stations.filter((s) => !s.entrance && s.name), [stations]);
  const [visible, setVisible] = useState<Station[]>([]);
  const lastCheck = useRef(0);
  const lastKey = useRef("");

  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastCheck.current < 0.25) return;
    lastCheck.current = clock.elapsedTime;
    const target = controls?.target;
    if (!target) return;
    const next: Station[] = [];
    if (camera.position.distanceTo(target) < ZOOMED_IN) {
      const near = named
        .map((station) => ({ station, d: Math.hypot(station.x - target.x, station.z - target.z) }))
        .filter((entry) => entry.d < LABEL_RADIUS)
        .sort((a, b) => a.d - b.d);
      // One label per station name: OSM often maps a node per line.
      for (const { station } of near) {
        if (next.some((s) => s.name === station.name && Math.hypot(s.x - station.x, s.z - station.z) < 25)) continue;
        next.push(station);
        if (next.length >= MAX_LABELS) break;
      }
    }
    const key = next.map((s) => s.id).join("|");
    if (key !== lastKey.current) {
      lastKey.current = key;
      setVisible(next);
    }
  });

  return (
    <group name="rail-station-labels">
      {visible.map((station) => (
        <Html key={station.id} position={[station.x, 1.45, station.z]} center distanceFactor={9} zIndexRange={[4, 0]}>
          <div className="rail-station">
            {mark ? (
              <span className="rail-station__mark" aria-hidden="true">
                {mark}
              </span>
            ) : null}
            <span className="rail-station__name">{station.name}</span>
            {station.colours.map((colour) => (
              <i key={colour} className="rail-station__chip" style={{ background: colour }} aria-hidden="true" />
            ))}
            {station.wheelchair === "yes" ? (
              <span className="rail-station__access" aria-label="Step-free access" title="Step-free access">
                ♿
              </span>
            ) : null}
          </div>
        </Html>
      ))}
    </group>
  );
}

/** Boston riders call it the T; elsewhere the label is the name and line colours only. */
function isBoston(bounds: GeoBounds) {
  const lon = (bounds.west + bounds.east) / 2;
  const lat = (bounds.south + bounds.north) / 2;
  return lon > -71.3 && lon < -70.9 && lat > 42.2 && lat < 42.5;
}

/**
 * Rail and transit from OpenStreetMap: surface track with ballast, rails,
 * and a stripe in the line's colour; tunnels as a faint dashed line;
 * bridges lifted on piers; platforms and stations.
 */
export function RailLayer({
  network,
  geoBounds,
}: {
  network: RailNetwork;
  geoBounds: GeoBounds;
  reducedMotion?: boolean;
}) {
  const built = useMemo(() => buildRailGeometry(network), [network]);
  useEffect(() => () => disposeRail(built), [built]);
  const looks = useMemo(
    () => ({
      ballast: new THREE.MeshStandardMaterial({ color: "#8d867c", roughness: 0.95 }),
      minor: new THREE.MeshStandardMaterial({ color: "#9a948b", roughness: 0.95 }),
      rail: new THREE.MeshStandardMaterial({ color: "#c4cad0", metalness: 0.75, roughness: 0.3 }),
      deck: new THREE.MeshStandardMaterial({ color: "#b9b6ae", roughness: 0.8, side: THREE.DoubleSide }),
      platform: new THREE.MeshStandardMaterial({ color: "#cfcac0", roughness: 0.75, side: THREE.DoubleSide }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const m of Object.values(looks)) m.dispose();
    },
    [looks],
  );
  const stripeLooks = useMemo(
    () =>
      built.stripes.map(
        ({ colour }) =>
          new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.35, roughness: 0.6 }),
      ),
    [built],
  );
  const tunnelLooks = useMemo(
    () =>
      built.tunnels.map(
        ({ colour }) =>
          new THREE.MeshBasicMaterial({
            color: colour,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            toneMapped: false,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3,
          }),
      ),
    [built],
  );
  useEffect(
    () => () => {
      for (const m of [...stripeLooks, ...tunnelLooks]) m.dispose();
    },
    [stripeLooks, tunnelLooks],
  );
  const mark = isBoston(geoBounds) ? "T" : "";

  if (network.lines.length === 0 && network.stations.length === 0) return null;
  return (
    <group name="rail">
      <mesh geometry={built.ballast} material={looks.ballast} receiveShadow raycast={() => null} />
      <mesh geometry={built.minorBallast} material={looks.minor} receiveShadow raycast={() => null} />
      <mesh geometry={built.rails} material={looks.rail} raycast={() => null} />
      <mesh geometry={built.deck} material={looks.deck} castShadow receiveShadow raycast={() => null} />
      <mesh geometry={built.platforms} material={looks.platform} castShadow receiveShadow raycast={() => null} />
      {built.stripes.map(({ colour, geometry }, i) => (
        <mesh key={`stripe-${colour}`} geometry={geometry} material={stripeLooks[i]} raycast={() => null} />
      ))}
      {built.tunnels.map(({ colour, geometry }, i) => (
        <mesh key={`tunnel-${colour}`} geometry={geometry} material={tunnelLooks[i]} renderOrder={3} raycast={() => null} />
      ))}
      <Ties ties={built.ties} />
      <StationMarkers stations={network.stations} />
      <StationLabels stations={network.stations} mark={mark} />
    </group>
  );
}
