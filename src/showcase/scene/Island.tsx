import { useMemo } from "react";
import { ToonMaterial } from "../materials";
import { scene } from "../palette";
import { ISLAND_SEGMENTS, islandPoint } from "../layout";
import { FacetGeometry } from "./FacetGeometry";
import { createGrassCap, createIslandBody } from "./geometries";

export function Island() {
  const body = useMemo(() => createIslandBody(), []);
  const grass = useMemo(() => createGrassCap(0.9, 0.04), []);

  return (
    <group>
      <mesh geometry={body}>
        <ToonMaterial color={scene.stone} />
      </mesh>
      <mesh geometry={grass}>
        <ToonMaterial color={scene.grass} />
      </mesh>
      {Array.from({ length: ISLAND_SEGMENTS }, (_, index) => {
        const [x, , z] = islandPoint(index, 0.98);
        const scale = 0.26 + (index % 3) * 0.07;
        return (
          <mesh
            key={index}
            position={[x, -0.05, z]}
            rotation={[0.2, index * 0.7, 0.15 * (index % 2)]}
            scale={[scale, scale * 0.72, scale * 0.9]}
          >
            <FacetGeometry kind="dodeca" args={[1, 0]} />
            <ToonMaterial color={index % 2 === 0 ? scene.stone : scene.stoneDark} />
          </mesh>
        );
      })}
    </group>
  );
}
