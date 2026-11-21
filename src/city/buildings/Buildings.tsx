import * as THREE from "three";
import basemap from "../../../data/wellesley/basemap.geojson";
import { defaultProjector } from "../../showcase/layout";
import { parseBasemap } from "../../showcase/scene/parseBasemap";
import { createExtrudedBuilding } from "../../showcase/scene/ribbonGeometry";

const GLASS = "#ffffff";
const EDGE = "#1488FF";

type GlassBlock = {
  id: string;
  geometry: THREE.BufferGeometry;
  edges: THREE.EdgesGeometry;
};

function createGlassBlocks(): GlassBlock[] {
  const parsed = parseBasemap(basemap, defaultProjector);
  if (!parsed) return [];
  const blocks: GlassBlock[] = [];
  for (const building of parsed.buildings) {
    const geometry = createExtrudedBuilding(building.ring, building.height * 1.35);
    if (!geometry) continue;
    blocks.push({
      id: building.id,
      geometry,
      edges: new THREE.EdgesGeometry(geometry, 18),
    });
  }
  return blocks;
}

const GLASS_BLOCKS = createGlassBlocks();

/** White blocks with a MORROW-blue edge. */
export function Buildings() {
  return (
    <group name="buildings">
      {GLASS_BLOCKS.map((block) => (
        <group key={block.id}>
          <mesh geometry={block.geometry} castShadow raycast={() => null}>
            <meshStandardMaterial
              color={GLASS}
              emissive={EDGE}
              emissiveIntensity={0.22}
              transparent
              opacity={0.82}
              roughness={0.16}
              metalness={0.12}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
            />
          </mesh>
          <lineSegments geometry={block.edges} raycast={() => null} renderOrder={2}>
            <lineBasicMaterial color={EDGE} toneMapped={false} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}
