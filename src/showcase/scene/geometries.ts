import * as THREE from "three";
import { ISLAND_SEGMENTS, islandPoint } from "../layout";

function geometryFromTriangles(triangles: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createIslandBody(): THREE.BufferGeometry {
  const topY = 0;
  const bottomY = -1.9;
  const bottomScale = 0.58;
  const positions: number[] = [];
  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  for (let index = 0; index < ISLAND_SEGMENTS; index += 1) {
    const next = (index + 1) % ISLAND_SEGMENTS;
    const [x, , z] = islandPoint(index, 1);
    const [nx, , nz] = islandPoint(next, 1);
    const [bx, , bz] = islandPoint(index, bottomScale);
    const [bnx, , bnz] = islandPoint(next, bottomScale);

    pushTri(0, topY, 0, x, topY, z, nx, topY, nz);
    pushTri(0, bottomY, 0, bx, bottomY, bz, bnx, bottomY, bnz);
    pushTri(x, topY, z, nx, topY, nz, bnx, bottomY, bnz);
    pushTri(x, topY, z, bnx, bottomY, bnz, bx, bottomY, bz);
  }

  return geometryFromTriangles(positions);
}

export function createGrassCap(scale: number, y: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let index = 0; index < ISLAND_SEGMENTS; index += 1) {
    const next = (index + 1) % ISLAND_SEGMENTS;
    const [x, , z] = islandPoint(index, scale);
    const [nx, , nz] = islandPoint(next, scale);
    positions.push(0, y, 0, x, y, z, nx, y, nz);
  }
  return geometryFromTriangles(positions);
}

/** Gable roof. Ridge runs along Z, eaves along X. */
export function createGableGeometry(width: number, depth: number, height: number): THREE.BufferGeometry {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const positions = [
    -halfWidth, 0, -halfDepth, -halfWidth, 0, halfDepth, 0, height, halfDepth,
    -halfWidth, 0, -halfDepth, 0, height, halfDepth, 0, height, -halfDepth,
    halfWidth, 0, halfDepth, halfWidth, 0, -halfDepth, 0, height, -halfDepth,
    halfWidth, 0, halfDepth, 0, height, -halfDepth, 0, height, halfDepth,
    -halfWidth, 0, halfDepth, halfWidth, 0, halfDepth, 0, height, halfDepth,
    halfWidth, 0, -halfDepth, -halfWidth, 0, -halfDepth, 0, height, -halfDepth,
  ];
  return geometryFromTriangles(positions);
}

/** Wedge sloping up toward +X. The low end sits on y = 0. */
export function createRampGeometry(length: number, rise: number, width: number): THREE.BufferGeometry {
  const x0 = -length / 2;
  const x1 = length / 2;
  const z0 = -width / 2;
  const z1 = width / 2;
  const positions = [
    // Slope, facing upward.
    x0, 0, z0, x0, 0, z1, x1, rise, z1,
    x0, 0, z0, x1, rise, z1, x1, rise, z0,
    // Vertical face at the high end.
    x1, 0, z0, x1, rise, z0, x1, rise, z1,
    x1, 0, z0, x1, rise, z1, x1, 0, z1,
    // Belly.
    x0, 0, z0, x1, 0, z0, x0, 0, z1,
    x0, 0, z1, x1, 0, z0, x1, 0, z1,
    // Sides.
    x0, 0, z0, x1, rise, z0, x1, 0, z0,
    x0, 0, z1, x1, 0, z1, x1, rise, z1,
  ];
  return geometryFromTriangles(positions);
}
