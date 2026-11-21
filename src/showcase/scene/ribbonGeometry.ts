import * as THREE from "three";

function pushTri(out: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function pushQuad(
  out: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
) {
  pushTri(out, a, b, c);
  pushTri(out, a, c, d);
}

/**
 * Flat ground ribbon for road / footway polylines in local [x, z].
 */
export function createRibbonGeometry(
  points: readonly (readonly [number, number])[],
  halfWidth: number,
  y = 0.02,
  thickness = 0.03,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const positions: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) continue;
    const sx = dz / len;
    const sz = -dx / len;
    const y0 = y;
    const y1 = y + thickness;
    const aL = new THREE.Vector3(a[0] - sx * halfWidth, y0, a[1] - sz * halfWidth);
    const aR = new THREE.Vector3(a[0] + sx * halfWidth, y0, a[1] + sz * halfWidth);
    const bL = new THREE.Vector3(b[0] - sx * halfWidth, y0, b[1] - sz * halfWidth);
    const bR = new THREE.Vector3(b[0] + sx * halfWidth, y0, b[1] + sz * halfWidth);
    const aLt = new THREE.Vector3(aL.x, y1, aL.z);
    const aRt = new THREE.Vector3(aR.x, y1, aR.z);
    const bLt = new THREE.Vector3(bL.x, y1, bL.z);
    const bRt = new THREE.Vector3(bR.x, y1, bR.z);
    pushQuad(positions, aLt, aRt, bRt, bLt);
    pushQuad(positions, aL, bL, bR, aR);
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createExtrudedBuilding(
  ring: readonly (readonly [number, number])[],
  height: number,
): THREE.BufferGeometry | null {
  if (ring.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i += 1) {
    shape.lineTo(ring[i][0], ring[i][1]);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  // ExtrudeGeometry grows along +Z; rotate so height is +Y.
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}
