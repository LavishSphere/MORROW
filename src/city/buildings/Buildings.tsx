import * as THREE from "three";
import basemap from "../../../data/wellesley/basemap.geojson";
import { defaultProjector } from "../../showcase/layout";
import { parseBasemap } from "../../showcase/scene/parseBasemap";
import { createExtrudedBuilding } from "../../showcase/scene/ribbonGeometry";

const GLASS = "#9aebff";
const EDGE = "#f7feff";

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

/** Translucent cyan blocks with a white edge glow. */
export function Buildings() {
  return (
    <group name="buildings">
      {GLASS_BLOCKS.map((block) => (
        <group key={block.id}>
          <mesh geometry={block.geometry} castShadow raycast={() => null}>
            <meshStandardMaterial
              color={GLASS}
              emissive="#7ad7ff"
              emissiveIntensity={0.5}
              transparent
              opacity={0.4}
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
