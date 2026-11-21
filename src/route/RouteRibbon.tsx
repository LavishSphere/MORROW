import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Vector3,
  type ColorRepresentation,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import { LOGO_BLUE, PLACEHOLDER_STREET } from "./placeholder";

/** A point on the street polyline, in the scene's local coordinates. */
export type RoutePoint =
  | readonly [number, number, number]
  | readonly [number, number]
  | { readonly x: number; readonly y: number; readonly z: number };

export type RouteRibbonProps = {
  /**
   * Street polyline in local coordinates. A 2-tuple is treated as `[x, z]`
   * with the ribbon sitting just above the ground. Omit both geometry props
   * to draw the built-in placeholder street.
   */
  routeGeometry?: readonly RoutePoint[];
  /** Same as `routeGeometry`. Used when `routeGeometry` is omitted. */
  points?: readonly RoutePoint[];
  /** Ribbon color. Defaults to the MORROW logo blue. */
  color?: ColorRepresentation;
  /** Dims the ribbon and holds it still. */
  reducedMotion?: boolean;
};

const MAX_POINTS = 256;
const LIFT = 0.03;

function geometryKey(
  routeGeometry: readonly RoutePoint[] | undefined,
  points: readonly RoutePoint[] | undefined,
): string {
  if (routeGeometry !== undefined) return `g:${JSON.stringify(routeGeometry)}`;
  if (points !== undefined) return `p:${JSON.stringify(points)}`;
  return "placeholder";
}

function readPoints(source: readonly RoutePoint[]): Vector3[] {
  const vectors: Vector3[] = [];
  for (const point of source) {
    if (point == null || typeof point !== "object") continue;
    let x: number;
    let y: number;
    let z: number;
    if (Array.isArray(point)) {
      if (point.length >= 3) {
        x = Number(point[0]);
        y = Number(point[1]);
        z = Number(point[2]);
      } else if (point.length === 2) {
        x = Number(point[0]);
        y = 0.12;
        z = Number(point[1]);
      } else {
        continue;
      }
    } else if ("x" in point && "y" in point && "z" in point) {
      x = Number(point.x);
      y = Number(point.y);
      z = Number(point.z);
    } else {
      continue;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const next = new Vector3(x, y + LIFT, z);
    const prev = vectors[vectors.length - 1];
    if (prev && prev.distanceToSquared(next) < 1e-8) continue;
    vectors.push(next);
  }
  return limitPoints(vectors);
}

function limitPoints(points: Vector3[]): Vector3[] {
  if (points.length <= MAX_POINTS) return points;
  const sampled: Vector3[] = [];
  const last = points.length - 1;
  for (let i = 0; i < MAX_POINTS; i += 1) {
    sampled.push(points[Math.round((i * last) / (MAX_POINTS - 1))]);
  }
  return sampled;
}

function sourceForKey(key: string): readonly RoutePoint[] {
  if (key === "placeholder") return PLACEHOLDER_STREET;
  try {
    const parsed: unknown = JSON.parse(key.slice(2));
    return Array.isArray(parsed) ? (parsed as RoutePoint[]) : [];
  } catch {
    return [];
  }
}

function pushTri(out: number[], a: Vector3, b: Vector3, c: Vector3) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function pushQuad(out: number[], a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
  pushTri(out, a, b, c);
  pushTri(out, a, c, d);
}

function appendSegment(
  out: number[],
  a: Vector3,
  b: Vector3,
  halfWidth: number,
  halfHeight: number,
) {
  const delta = new Vector3().subVectors(b, a);
  const length = delta.length();
  if (length < 1e-4) return;
  const tangent = delta.multiplyScalar(1 / length);
  const flatLength = Math.hypot(tangent.x, tangent.z);
  const sideX = flatLength < 1e-6 ? 1 : tangent.z / flatLength;
  const sideZ = flatLength < 1e-6 ? 0 : -tangent.x / flatLength;
  const side = new Vector3(sideX, 0, sideZ);
  const up = new Vector3(0, 1, 0);
  const start = a.clone().addScaledVector(tangent, -0.012);
  const end = b.clone().addScaledVector(tangent, 0.012);

  const corner = (origin: Vector3, sway: number, lift: number) =>
    origin.clone().addScaledVector(side, sway).addScaledVector(up, lift);

  const s0 = corner(start, -halfWidth, -halfHeight);
  const s1 = corner(start, halfWidth, -halfHeight);
  const s2 = corner(start, halfWidth, halfHeight);
  const s3 = corner(start, -halfWidth, halfHeight);
  const e0 = corner(end, -halfWidth, -halfHeight);
  const e1 = corner(end, halfWidth, -halfHeight);
  const e2 = corner(end, halfWidth, halfHeight);
  const e3 = corner(end, -halfWidth, halfHeight);

  pushQuad(out, s3, s2, e2, e3);
  pushQuad(out, s0, e0, e1, s1);
  pushQuad(out, s0, s3, e3, e0);
  pushQuad(out, s1, e1, e2, s2);
  pushQuad(out, s0, s1, s2, s3);
  pushQuad(out, e3, e2, e1, e0);
}

function ribbonGeometry(points: Vector3[], halfWidth: number, halfHeight: number): BufferGeometry | null {
  if (points.length < 2) return null;
  const positions: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    appendSegment(positions, points[i], points[i + 1], halfWidth, halfHeight);
  }
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildTubes(key: string): { core: BufferGeometry; halo: BufferGeometry } | null {
  const points = readPoints(sourceForKey(key));
  const core = ribbonGeometry(points, 0.2, 0.045);
  const halo = ribbonGeometry(points, 0.46, 0.02);
  if (!core || !halo) {
    core?.dispose();
    halo?.dispose();
    return null;
  }
  return { core, halo };
}

/** The route light does not take picks away from the curb and the ramp. */
function ignoreRaycast() {
  return undefined;
}

/**
 * Glowing low-poly ribbon along a street polyline.
 *
 * ShowcaseCanvas imports this as `../route/RouteRibbon`.
 * Pass `color` for the light color. `reducedMotion` dims the ribbon and
 * stops the pulse.
 */
export function RouteRibbon({
  routeGeometry,
  points,
  color = LOGO_BLUE,
  reducedMotion = false,
}: RouteRibbonProps) {
  const key = geometryKey(routeGeometry, points);
  const tubes = useMemo(() => buildTubes(key), [key]);
  const coreRef = useRef<MeshStandardMaterial>(null);
  const haloRef = useRef<MeshBasicMaterial>(null);

  useEffect(() => {
    if (!tubes) return undefined;
    return () => {
      tubes.core.dispose();
      tubes.halo.dispose();
    };
  }, [tubes]);

  useFrame(({ clock }) => {
    const core = coreRef.current;
    const halo = haloRef.current;
    if (!core || !halo) return;
    if (reducedMotion) {
      core.emissiveIntensity = 0.08;
      core.opacity = 0.34;
      halo.opacity = 0.04;
      return;
    }
    const pulse = 0.5 + Math.sin(clock.elapsedTime * 2.15) * 0.5;
    core.emissiveIntensity = 0.55 + pulse * 0.75;
    core.opacity = 0.94;
    halo.opacity = 0.12 + pulse * 0.18;
  });

  if (!tubes) return null;

  return (
    <group name="route-ribbon">
      <mesh geometry={tubes.halo} renderOrder={1} raycast={ignoreRaycast}>
        <meshBasicMaterial
          ref={haloRef}
          color={color}
          transparent
          opacity={reducedMotion ? 0.04 : 0.2}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={tubes.core} renderOrder={2} raycast={ignoreRaycast}>
        <meshStandardMaterial
          ref={coreRef}
          color={color}
          emissive={color}
          emissiveIntensity={reducedMotion ? 0.08 : 0.95}
          roughness={0.32}
          metalness={0.04}
          flatShading
          transparent
          opacity={reducedMotion ? 0.34 : 0.94}
          toneMapped={false}
          side={DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}
