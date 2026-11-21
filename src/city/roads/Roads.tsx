import { useEffect, useMemo } from "react";
import basemap from "../../../data/wellesley/basemap.geojson";
import { defaultProjector } from "../../showcase/layout";
import { parseBasemap } from "../../showcase/scene/parseBasemap";
import { createRibbonGeometry } from "../../showcase/scene/ribbonGeometry";

const ROAD_COLOR = "#163a46";
const FOOT_COLOR = "#0e2c36";
const ROAD_GLOW = "#9aebff";
const FOOT_GLOW = "#4ec4d4";

/**
 * Glowing road ribbons and dimmer footways from the Wellesley basemap.
 * Ribbons do not take picks; issue markers sit above them.
 */
export function Roads() {
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
    <group name="roads">
      {ways.map((way) => (
        <mesh key={way.id} geometry={way.geometry} raycast={() => null}>
          <meshStandardMaterial
            color={way.glow ? ROAD_COLOR : FOOT_COLOR}
            emissive={way.glow ? ROAD_GLOW : FOOT_GLOW}
            emissiveIntensity={way.glow ? 0.85 : 0.35}
            roughness={0.35}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  );
}
