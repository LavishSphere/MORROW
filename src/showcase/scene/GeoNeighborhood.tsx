import { useEffect, useMemo } from "react";
import type { SceneProjector } from "../geo";
import { Surface } from "../materials";
import { LOGO_BLUE, scene } from "../palette";
import { parseBasemap, type WayRibbon } from "./parseBasemap";
import { createExtrudedBuilding, createRibbonGeometry } from "./ribbonGeometry";

type GeoNeighborhoodProps = {
  geoJson: unknown;
  projector: SceneProjector;
  /** Edge ids unlocked by the selected intervention — lit in logo blue. */
  highlightedEdgeIds?: readonly string[];
};

const WAY_COLOR: Record<WayRibbon["layer"], string> = {
  road: scene.asphalt,
  sidewalk: scene.sidewalk,
  footway: "#9aa4a0",
  path: "#8f9a88",
};

function Ground({ span }: { span: number }) {
  const size = Math.max(22, span * 1.35);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow raycast={() => null}>
      <circleGeometry args={[size * 0.72, 64]} />
      <meshStandardMaterial color="#0c1418" roughness={0.95} metalness={0.02} />
    </mesh>
  );
}

function BuildingMesh({
  id,
  ring,
  height,
}: {
  id: string;
  ring: readonly (readonly [number, number])[];
  height: number;
}) {
  const geometry = useMemo(() => createExtrudedBuilding(ring, height), [ring, height]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh name={id} geometry={geometry} castShadow receiveShadow raycast={() => null}>
      <Surface color="#1a2430" roughness={0.82} metalness={0.06} />
    </mesh>
  );
}

function WayMesh({
  way,
  highlighted,
}: {
  way: WayRibbon;
  highlighted: boolean;
}) {
  const geometry = useMemo(
    () => createRibbonGeometry(way.points, way.halfWidth, highlighted ? 0.04 : 0.02, 0.035),
    [way.points, way.halfWidth, highlighted],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh name={way.id} geometry={geometry} receiveShadow raycast={() => null}>
      <meshStandardMaterial
        color={highlighted ? LOGO_BLUE : WAY_COLOR[way.layer]}
        emissive={highlighted ? LOGO_BLUE : "#000000"}
        emissiveIntensity={highlighted ? 0.55 : 0}
        roughness={highlighted ? 0.4 : 0.88}
        metalness={0.04}
        toneMapped={!highlighted}
      />
    </mesh>
  );
}

/**
 * Miniature Wellesley neighborhood extruded from Ashsmith's basemap GeoJSON.
 */
export function GeoNeighborhood({
  geoJson,
  projector,
  highlightedEdgeIds = [],
}: GeoNeighborhoodProps) {
  const parsed = useMemo(() => parseBasemap(geoJson, projector), [geoJson, projector]);
  const highlight = useMemo(() => new Set(highlightedEdgeIds), [highlightedEdgeIds]);

  if (!parsed) return null;

  return (
    <group name="geo-neighborhood">
      <Ground span={projector.span} />
      {parsed.buildings.map((building) => (
        <BuildingMesh
          key={building.id}
          id={building.id}
          ring={building.ring}
          height={building.height}
        />
      ))}
      {parsed.ways.map((way) => (
        <WayMesh
          key={way.id}
          way={way}
          highlighted={Boolean(way.edgeId && highlight.has(way.edgeId))}
        />
      ))}
      {/* Soft atmospheric fill under the miniature. */}
      <mesh position={[0, -0.4, 0]} raycast={() => null}>
        <cylinderGeometry args={[projector.span * 0.55, projector.span * 0.62, 0.5, 48]} />
        <meshBasicMaterial color="#02060c" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
