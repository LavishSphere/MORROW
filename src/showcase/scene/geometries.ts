import * as THREE from "three";

function geometryFromTriangles(triangles: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Wedge sloping up toward +X. The low end sits on y = 0. */
export function createRampGeometry(length: number, rise: number, width: number): THREE.BufferGeometry {
  const x0 = -length / 2;
  const x1 = length / 2;
  const z0 = -width / 2;
  const z1 = width / 2;
  const positions = [
    x0, 0, z0, x0, 0, z1, x1, rise, z1,
    x0, 0, z0, x1, rise, z1, x1, rise, z0,
    x1, 0, z0, x1, rise, z0, x1, rise, z1,
    x1, 0, z0, x1, rise, z1, x1, 0, z1,
    x0, 0, z0, x1, 0, z0, x0, 0, z1,
    x0, 0, z1, x1, 0, z0, x1, 0, z1,
    x0, 0, z0, x1, rise, z0, x1, 0, z0,
    x0, 0, z1, x1, 0, z1, x1, rise, z1,
  ];
  return geometryFromTriangles(positions);
}
