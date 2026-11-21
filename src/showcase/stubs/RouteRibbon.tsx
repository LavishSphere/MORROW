import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LOGO_BLUE } from "../palette";
import type { RouteRibbonProps } from "../types";

function tube(points: readonly (readonly [number, number, number])[], radius: number) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(point[0], point[1], point[2])),
    false,
    "catmullrom",
    0.12,
  );
  return new THREE.TubeGeometry(curve, 28, radius, 5, false);
}

/** Temporary stand-in for src/route/RouteRibbon. */
export function RouteRibbon({ routeGeometry, reducedMotion = false }: RouteRibbonProps) {
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const core = useMemo(
    () => (routeGeometry && routeGeometry.points.length >= 2 ? tube(routeGeometry.points, 0.22) : null),
    [routeGeometry],
  );
  const halo = useMemo(
    () => (routeGeometry && routeGeometry.points.length >= 2 ? tube(routeGeometry.points, 0.55) : null),
    [routeGeometry],
  );

  useEffect(() => {
    return () => {
      core?.dispose();
      halo?.dispose();
    };
  }, [core, halo]);

  useFrame(({ clock }) => {
    if (!glow.current || reducedMotion) return;
    glow.current.opacity = 0.22 + Math.sin(clock.elapsedTime * 2.4) * 0.08;
  });

  if (!core || !halo) return null;

  return (
    <group name="route-ribbon">
      <mesh geometry={core}>
        <meshBasicMaterial color={LOGO_BLUE} toneMapped={false} />
      </mesh>
      <mesh geometry={halo}>
        <meshBasicMaterial
          ref={glow}
          color={LOGO_BLUE}
          transparent
          opacity={0.24}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
