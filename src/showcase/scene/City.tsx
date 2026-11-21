import { useMemo } from "react";
import { createAsphaltTexture, createConcreteTexture, Surface } from "../materials";
import { DetailedBuilding } from "./facades";
import { DetailedCar } from "./vehicles";
import { scene } from "../palette";
import {
  BUILDINGS,
  CARS,
  CITY_LIMIT,
  ROAD_HALF,
  ROAD_XS,
  ROAD_ZS,
  SIDEWALK_WIDTH,
  TREES,
  sidewalkSegments,
} from "./cityData";
import { ROAD_TOP, SIDEWALK_TOP } from "../layout";

function Tree({ position }: { position: readonly [number, number] }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 2.2, 12]} />
        <Surface color={scene.trunk} roughness={0.95} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <sphereGeometry args={[1.15, 24, 18]} />
        <Surface color={scene.leaf} roughness={0.9} />
      </mesh>
      <mesh position={[0.45, 2.9, 0.2]} castShadow>
        <sphereGeometry args={[0.75, 20, 14]} />
        <Surface color={scene.grassLight} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Roads() {
  const along = sidewalkSegments(CITY_LIMIT, ROAD_ZS);
  const across = sidewalkSegments(CITY_LIMIT, ROAD_XS);
  const roadThickness = 0.05;
  const walkThickness = SIDEWALK_TOP;
  const asphalt = useMemo(() => createAsphaltTexture(), []);
  const concrete = useMemo(() => createConcreteTexture(), []);

  return (
    <group>
      {ROAD_XS.map((x) => (
        <mesh key={`road-x-${x}`} position={[x, ROAD_TOP - roadThickness / 2, 0]} receiveShadow raycast={() => null}>
          <boxGeometry args={[ROAD_HALF * 2, roadThickness, CITY_LIMIT * 2]} />
          <Surface map={asphalt} color="#ffffff" roughness={0.92} metalness={0.04} />
        </mesh>
      ))}
      {ROAD_ZS.map((z) => (
        <mesh key={`road-z-${z}`} position={[0, ROAD_TOP - roadThickness / 2 + 0.005, z]} receiveShadow raycast={() => null}>
          <boxGeometry args={[CITY_LIMIT * 2, roadThickness, ROAD_HALF * 2]} />
          <Surface map={asphalt} color="#ffffff" roughness={0.92} metalness={0.04} />
        </mesh>
      ))}
      {ROAD_XS.map((x) =>
        [-1, 1].map((side) =>
          along.map(([start, end]) => {
            const length = end - start;
            const center = (start + end) / 2;
            return (
              <mesh
                key={`walk-${x}-${side}-${start}`}
                position={[x + side * (ROAD_HALF + SIDEWALK_WIDTH / 2), walkThickness / 2, center]}
                receiveShadow
                raycast={() => null}
              >
                <boxGeometry args={[SIDEWALK_WIDTH, walkThickness, length]} />
                <Surface map={concrete} color="#ffffff" roughness={0.84} metalness={0.02} />
              </mesh>
            );
          }),
        ),
      )}
      {ROAD_ZS.map((z) =>
        [-1, 1].map((side) =>
          across.map(([start, end]) => {
            const length = end - start;
            const center = (start + end) / 2;
            return (
              <mesh
                key={`walkz-${z}-${side}-${start}`}
                position={[center, walkThickness / 2, z + side * (ROAD_HALF + SIDEWALK_WIDTH / 2)]}
                receiveShadow
                raycast={() => null}
              >
                <boxGeometry args={[length, walkThickness, SIDEWALK_WIDTH]} />
                <Surface map={concrete} color="#ffffff" roughness={0.84} metalness={0.02} />
              </mesh>
            );
          }),
        ),
      )}
    </group>
  );
}

export function City() {
  return (
    <group>
      <Roads />
      {BUILDINGS.map((spec) => (
        <DetailedBuilding key={`${spec.x}-${spec.z}`} {...spec} />
      ))}
      {TREES.map((position) => (
        <Tree key={`${position[0]}-${position[1]}`} position={position} />
      ))}
      {CARS.map((car) => (
        <DetailedCar
          key={`${car.x}-${car.z}`}
          position={[car.x, 0, car.z]}
          rotation={car.rot}
          color={car.color}
        />
      ))}
    </group>
  );
}
