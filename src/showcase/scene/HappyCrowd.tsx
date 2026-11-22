import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const SHIRTS = ["#ff6b6b", "#ffd23f", "#3ec1d3", "#1488ff", "#8e7cff", "#2ecc71", "#ff9f43", "#f78fb3"];
const SKIN = ["#f2c7a5", "#d9a37a", "#b07a52", "#8a5a3b", "#f5d6bd", "#6b4429"];
const PANTS = ["#2f3e4e", "#3d3d3d", "#4a5a7a", "#5b4636"];

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

type Figure = {
  x: number;
  z: number;
  facing: number;
  phase: number;
  shirt: string;
  skin: string;
  pants: string;
  wheelchair: boolean;
};

function Arms({ figure, y }: { figure: Figure; y: number }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          name="arm"
          position={[side * 0.1, y + 0.08, 0]}
          rotation={[0, 0, side * -0.45]}
          raycast={() => null}
        >
          <capsuleGeometry args={[0.022, 0.16, 4, 6]} />
          <meshStandardMaterial color={figure.skin} roughness={0.7} />
        </mesh>
      ))}
    </>
  );
}

/** One person, arms up. People are drawn about 2.5× life size so they read at town scale. */
function Person({ figure }: { figure: Figure }) {
  return (
    <group>
      <mesh position={[0, 0.16, 0]} castShadow raycast={() => null}>
        <capsuleGeometry args={[0.05, 0.16, 4, 8]} />
        <meshStandardMaterial color={figure.pants} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow raycast={() => null}>
        <capsuleGeometry args={[0.07, 0.14, 4, 10]} />
        <meshStandardMaterial color={figure.shirt} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow raycast={() => null}>
        <sphereGeometry args={[0.07, 14, 10]} />
        <meshStandardMaterial color={figure.skin} roughness={0.7} />
      </mesh>
      <Arms figure={figure} y={0.42} />
    </group>
  );
}

/** A wheelchair user, cheering too. */
function Rider({ figure }: { figure: Figure }) {
  return (
    <group>
      {[-0.11, 0.11].map((side) => (
        <mesh key={side} position={[side, 0.13, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
          <torusGeometry args={[0.12, 0.018, 8, 20]} />
          <meshStandardMaterial color="#cfd6da" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.17, 0]} raycast={() => null}>
        <boxGeometry args={[0.2, 0.03, 0.18]} />
        <meshStandardMaterial color="#2f3e4e" />
      </mesh>
      <mesh position={[0, 0.3, -0.06]} castShadow raycast={() => null}>
        <capsuleGeometry args={[0.07, 0.12, 4, 10]} />
        <meshStandardMaterial color={figure.shirt} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.47, -0.06]} castShadow raycast={() => null}>
        <sphereGeometry args={[0.07, 14, 10]} />
        <meshStandardMaterial color={figure.skin} roughness={0.7} />
      </mesh>
      <Arms figure={figure} y={0.36} />
    </group>
  );
}

const CROWD_SCALE = 1.2;

/**
 * A small happy crowd around a fix: people facing it with arms up,
 * bouncing, and (for ramps and crossings) a wheelchair user rolling in.
 * Holds still with reduced motion.
 */
export function HappyCrowd({
  x,
  z,
  count,
  wheelchair,
  seed,
  reducedMotion,
}: {
  x: number;
  z: number;
  count: number;
  wheelchair: boolean;
  seed: number;
  reducedMotion: boolean;
}) {
  const figures = useMemo<Figure[]>(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + seed * 6.28;
        // Stand back from the fix so it stays visible: around its edge, not on it.
        const r = 1.9 + hash(seed * 31 + i) * 0.8;
        const fx = Math.cos(angle) * r;
        const fz = Math.sin(angle) * r;
        return {
          x: fx,
          z: fz,
          // Face the fix.
          facing: Math.atan2(-fx, -fz),
          phase: hash(seed * 17 + i) * Math.PI * 2,
          shirt: SHIRTS[Math.floor(hash(seed + i * 3) * SHIRTS.length)] ?? SHIRTS[0]!,
          skin: SKIN[Math.floor(hash(seed * 7 + i) * SKIN.length)] ?? SKIN[0]!,
          pants: PANTS[Math.floor(hash(seed * 11 + i) * PANTS.length)] ?? PANTS[0]!,
          wheelchair: wheelchair && i === 0,
        };
      }),
    [count, wheelchair, seed],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const crowd = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    born.current ??= t;
    // Pop in over half a second when the fix is made.
    const grow = reducedMotion ? 1 : Math.min(1, (t - born.current) / 0.5);
    crowd.current?.scale.setScalar(0.2 + 0.8 * grow * (2 - grow));
    figures.forEach((figure, i) => {
      const group = groups.current[i];
      if (!group) return;
      if (reducedMotion) {
        group.position.y = 0;
        return;
      }
      const beat = t * 5 + figure.phase;
      if (figure.wheelchair) {
        // Roll back and forth instead of jumping.
        const roll = Math.sin(beat * 0.4) * 0.25;
        group.position.x = figure.x + Math.sin(figure.facing) * roll;
        group.position.z = figure.z + Math.cos(figure.facing) * roll;
      } else {
        group.position.y = Math.abs(Math.sin(beat)) * 0.14;
      }
      group.traverse((child) => {
        if (child.name === "arm") child.rotation.x = Math.sin(beat * 2) * 0.35;
      });
    });
  });

  return (
    <group ref={crowd} position={[x, 0, z]} name="happy-crowd">
      {figures.map((figure, i) => (
        <group
          key={i}
          ref={(node) => {
            groups.current[i] = node;
          }}
          position={[figure.x, 0, figure.z]}
          rotation={[0, figure.facing, 0]}
          // A touch larger than the walkers on the paths, so the crowd reads, but
          // still people-sized next to houses and cars.
          scale={CROWD_SCALE}
        >
          {figure.wheelchair ? <Rider figure={figure} /> : <Person figure={figure} />}
        </group>
      ))}
    </group>
  );
}
