import * as THREE from "three";

/**
 * Original parked sedan. Local +Z is the nose.
 * With the group origin at y = 0, the tire bottoms sit at y = 0.15.
 */

const LENGTH = 4.3;
const HALF_LENGTH = LENGTH / 2;
const HALF_WIDTH = 0.9;
const TIRE_RADIUS = 0.33;
const TIRE_WIDTH = 0.22;
const TIRE_BOTTOM = 0.15;
const WHEEL_Y = TIRE_BOTTOM + TIRE_RADIUS;
const WHEEL_X = 0.76;
const FRONT_AXLE = 1.24;
const REAR_AXLE = -1.3;
const ROCKER = 0.37;
const ARCH_RADIUS = TIRE_RADIUS + 0.07;
const BODY_STATIONS = 104;
const GLASS_STATIONS = 56;

const WIDTH_KEYS: readonly (readonly [number, number])[] = [
  [-2.15, 0.76],
  [-1.72, 0.86],
  [-1.3, 0.9],
  [-0.15, 0.86],
  [0.62, 0.86],
  [1.24, 0.9],
  [1.72, 0.84],
  [2.15, 0.76],
];

const SHOULDER_KEYS: readonly (readonly [number, number])[] = [
  [-2.15, 0.82],
  [-1.78, 0.98],
  [-1.3, 1.08],
  [-0.1, 1.05],
  [0.62, 1.07],
  [1.24, 1.08],
  [1.7, 0.94],
  [2.15, 0.8],
];

const CENTER_KEYS: readonly (readonly [number, number])[] = [
  [-2.15, 0.76],
  [-1.82, 0.9],
  [-1.4, 1.01],
  [-0.15, 1.04],
  [0.68, 1.06],
  [1.02, 0.9],
  [1.45, 0.82],
  [2.15, 0.76],
];

const GLASS_ROOF_KEYS: readonly (readonly [number, number])[] = [
  [-1.14, 1.02],
  [-0.78, 1.26],
  [-0.42, 1.46],
  [0.08, 1.45],
  [0.46, 1.26],
  [0.8, 1.04],
];

const GLASS_SILL_KEYS: readonly (readonly [number, number])[] = [
  [-1.14, 0.98],
  [-0.7, 1.01],
  [0.2, 1.02],
  [0.8, 1.0],
];

const GLASS_WIDTH_KEYS: readonly (readonly [number, number])[] = [
  [-1.14, 0.52],
  [-0.72, 0.72],
  [-0.2, 0.78],
  [0.36, 0.74],
  [0.8, 0.5],
];

function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function createCurve(keys: readonly (readonly [number, number])[]) {
  const ordered = [...keys].sort((a, b) => a[0] - b[0]);
  const xs = ordered.map((key) => key[0]);
  const ys = ordered.map((key) => key[1]);
  const count = xs.length;
  const spans: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    const span = xs[i + 1] - xs[i];
    spans.push(span);
    slopes.push((ys[i + 1] - ys[i]) / span);
  }
  const tangents = new Array<number>(count).fill(0);
  tangents[0] = slopes[0] ?? 0;
  tangents[count - 1] = slopes[count - 2] ?? 0;
  for (let i = 1; i < count - 1; i += 1) {
    const prev = slopes[i - 1] ?? 0;
    const next = slopes[i] ?? 0;
    if (prev * next <= 0) tangents[i] = 0;
    else {
      const spanPrev = spans[i - 1] ?? 1;
      const spanNext = spans[i] ?? 1;
      const w1 = 2 * spanNext + spanPrev;
      const w2 = spanNext + 2 * spanPrev;
      tangents[i] = (w1 + w2) / (w1 / prev + w2 / next);
    }
  }
  for (let i = 0; i < count - 1; i += 1) {
    const slope = slopes[i] ?? 0;
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slope;
    const b = tangents[i + 1] / slope;
    const sum = a * a + b * b;
    if (sum > 9) {
      const scale = 3 / Math.sqrt(sum);
      tangents[i] = scale * a * slope;
      tangents[i + 1] = scale * b * slope;
    }
  }

  return (z: number) => {
    if (z <= xs[0]) return ys[0];
    if (z >= xs[count - 1]) return ys[count - 1];
    let index = 0;
    while (index < count - 2 && z > xs[index + 1]) index += 1;
    const span = spans[index] ?? 1;
    const t = (z - xs[index]) / span;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[index] +
      (t3 - 2 * t2 + t) * span * tangents[index] +
      (-2 * t3 + 3 * t2) * ys[index + 1] +
      (t3 - t2) * span * tangents[index + 1]
    );
  };
}

const widthCurve = createCurve(WIDTH_KEYS);
const shoulderCurve = createCurve(SHOULDER_KEYS);
const centerCurve = createCurve(CENTER_KEYS);
const glassRoofCurve = createCurve(GLASS_ROOF_KEYS);
const glassSillCurve = createCurve(GLASS_SILL_KEYS);
const glassWidthCurve = createCurve(GLASS_WIDTH_KEYS);

function sideBottom(z: number) {
  let y = ROCKER;
  const reach = ARCH_RADIUS + 0.1;
  for (const axle of [FRONT_AXLE, REAR_AXLE]) {
    const dz = Math.abs(z - axle);
    const crown = ARCH_RADIUS - 0.08;
    if (dz <= crown) {
      y = Math.max(y, WHEEL_Y + Math.sqrt(ARCH_RADIUS * ARCH_RADIUS - dz * dz));
    } else if (dz < reach) {
      const edge = WHEEL_Y + Math.sqrt(ARCH_RADIUS * ARCH_RADIUS - crown * crown);
      const blend = smoothstep((dz - crown) / (reach - crown));
      y = Math.max(y, edge + (ROCKER - edge) * blend);
    }
  }
  return y;
}

function bellyHeight(z: number, ySide: number) {
  let y = 0.3;
  if (z > 1.45) y = 0.3 + smoothstep((z - 1.45) / 0.7) * 0.16;
  else if (z < -1.5) y = 0.3 + smoothstep((-1.5 - z) / 0.65) * 0.14;
  return Math.min(y, ySide - 0.05);
}

function pushLine(
  points: Array<[number, number]>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  segments: number,
  skipStart: boolean,
) {
  for (let i = skipStart ? 1 : 0; i <= segments; i += 1) {
    const t = i / segments;
    points.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
}

function pushTop(points: Array<[number, number]>, x1: number, y0: number, y1: number, segments: number) {
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const eased = t * t * (3 - 2 * t);
    points.push([x1 * t, y0 + (y1 - y0) * eased]);
  }
}

function pushArc(
  points: Array<[number, number]>,
  cx: number,
  cy: number,
  radius: number,
  a0: number,
  a1: number,
  segments: number,
) {
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const angle = a0 + (a1 - a0) * t;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
}

function halfSection(hw: number, yCenter: number, yOuter: number, yBottom: number, yBelly: number) {
  const rise = Math.max(0.02, yOuter - yBottom);
  const shoulderR = Math.min(0.16, hw * 0.32, rise * 0.36);
  const cornerR = Math.min(0.1, hw * 0.2, rise * 0.22);
  const points: Array<[number, number]> = [];
  pushTop(points, Math.max(0.04, hw - shoulderR), yCenter, yOuter, 7);
  pushArc(points, hw - shoulderR, yOuter - shoulderR, shoulderR, Math.PI / 2, 0, 6);
  pushLine(points, hw, yOuter - shoulderR, hw, yBottom + cornerR, 8, true);
  pushArc(points, hw - cornerR, yBottom + cornerR, cornerR, 0, -Math.PI / 2, 5);
  const lipX = hw - cornerR;
  let innerX = Math.min(0.54, lipX * 0.68);
  if (innerX > lipX - 0.05) innerX = Math.max(0.04, lipX * 0.55);
  pushLine(points, lipX, yBottom, innerX, yBottom, 4, true);
  pushLine(points, innerX, yBottom, innerX, yBelly, 4, true);
  pushLine(points, innerX, yBelly, 0, yBelly, 4, true);
  return points;
}

function bodySection(z: number) {
  const hw = THREE.MathUtils.clamp(widthCurve(z), 0.42, HALF_WIDTH);
  const ySide = sideBottom(z);
  const yOuter = Math.max(shoulderCurve(z), ySide + 0.11);
  const yBelly = bellyHeight(z, ySide);
  const yCenter = THREE.MathUtils.clamp(centerCurve(z), yBelly + 0.08, yOuter);
  return halfSection(hw, yCenter, yOuter, ySide, yBelly);
}

function glassSection(z: number) {
  const hw = Math.min(glassWidthCurve(z), widthCurve(z) - 0.06);
  const sill = glassSillCurve(z);
  const roof = Math.max(glassRoofCurve(z), sill + 0.05);
  const outer = sill + (roof - sill) * 0.78;
  return halfSection(Math.max(0.2, hw), roof, outer, sill, sill - 0.035);
}

function orientShell(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!index) return;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let best = 0;
  let bestAbs = -1;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i));
    b.fromBufferAttribute(position, index.getX(i + 1));
    c.fromBufferAttribute(position, index.getX(i + 2));
    const ax = Math.abs(a.x + b.x + c.x);
    if (ax > bestAbs) {
      bestAbs = ax;
      best = i;
    }
  }
  a.fromBufferAttribute(position, index.getX(best));
  b.fromBufferAttribute(position, index.getX(best + 1));
  c.fromBufferAttribute(position, index.getX(best + 2));
  const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a));
  const outside = a.x + b.x + c.x;
  if (normal.x * outside < 0) {
    for (let i = 0; i < index.count; i += 3) {
      const second = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, second);
    }
  }
  geometry.computeVertexNormals();
}

function loftShell(
  z0: number,
  z1: number,
  stations: number,
  sample: (z: number) => Array<[number, number]>,
) {
  const reference = sample((z0 + z1) / 2);
  const around = reference.length * 2 - 2;
  const rings = stations + 1;
  const positions = new Float32Array(rings * around * 3 + 6);

  for (let i = 0; i < rings; i += 1) {
    const z = z0 + ((z1 - z0) * i) / stations;
    const right = sample(z);
    for (let j = 0; j < right.length; j += 1) {
      const point = right[j] ?? [0, 0];
      const offset = (i * around + j) * 3;
      positions[offset] = point[0];
      positions[offset + 1] = point[1];
      positions[offset + 2] = z;
    }
    let cursor = right.length;
    for (let j = right.length - 2; j >= 1; j -= 1) {
      const point = right[j] ?? [0, 0];
      const offset = (i * around + cursor) * 3;
      positions[offset] = -point[0];
      positions[offset + 1] = point[1];
      positions[offset + 2] = z;
      cursor += 1;
    }
  }

  const writeCenter = (ring: number, vertex: number) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let j = 0; j < around; j += 1) {
      const offset = (ring * around + j) * 3;
      x += positions[offset];
      y += positions[offset + 1];
      z += positions[offset + 2];
    }
    const center = vertex * 3;
    positions[center] = x / around;
    positions[center + 1] = y / around;
    positions[center + 2] = z / around;
  };

  const tailCenter = rings * around;
  const noseCenter = tailCenter + 1;
  writeCenter(0, tailCenter);
  writeCenter(stations, noseCenter);

  const indices = new Uint32Array(stations * around * 6 + around * 6);
  let write = 0;
  for (let i = 0; i < stations; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const next = (j + 1) % around;
      const a = i * around + j;
      const b = i * around + next;
      const d = (i + 1) * around + j;
      const c = (i + 1) * around + next;
      indices[write] = a;
      indices[write + 1] = d;
      indices[write + 2] = b;
      indices[write + 3] = b;
      indices[write + 4] = d;
      indices[write + 5] = c;
      write += 6;
    }
  }
  const noseRing = stations * around;
  for (let j = 0; j < around; j += 1) {
    const next = (j + 1) % around;
    indices[write] = tailCenter;
    indices[write + 1] = next;
    indices[write + 2] = j;
    indices[write + 3] = noseCenter;
    indices[write + 4] = noseRing + j;
    indices[write + 5] = noseRing + next;
    write += 6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  orientShell(geometry);
  faceCap(geometry, tailCenter, -1);
  faceCap(geometry, noseCenter, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function faceCap(geometry: THREE.BufferGeometry, center: number, direction: number) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  if (!index) return;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i);
    const ib = index.getX(i + 1);
    const ic = index.getX(i + 2);
    if (ia !== center && ib !== center && ic !== center) continue;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    normal.subVectors(b, a).cross(c.clone().sub(a));
    if (normal.z * direction < 0) {
      for (let k = 0; k < index.count; k += 3) {
        const ka = index.getX(k);
        const kb = index.getX(k + 1);
        const kc = index.getX(k + 2);
        if (ka !== center && kb !== center && kc !== center) continue;
        index.setX(k + 1, kc);
        index.setX(k + 2, kb);
      }
    }
    break;
  }
}

function extrudedPanel(width: number, height: number, depth: number, radius: number) {
  const shape = new THREE.Shape();
  const halfW = width / 2;
  const halfH = height / 2;
  const r = Math.min(radius, halfW - 0.001, halfH - 0.001);
  shape.moveTo(-halfW + r, -halfH);
  shape.lineTo(halfW - r, -halfH);
  shape.absarc(halfW - r, -halfH + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(halfW, halfH - r);
  shape.absarc(halfW - r, halfH - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-halfW + r, halfH);
  shape.absarc(-halfW + r, halfH - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfW, -halfH + r);
  shape.absarc(-halfW + r, -halfH + r, r, Math.PI, Math.PI * 1.5, false);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 4,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

const bodyGeometry = loftShell(-HALF_LENGTH, HALF_LENGTH, BODY_STATIONS, bodySection);
const glassGeometry = loftShell(-1.14, 0.8, GLASS_STATIONS, glassSection);
const grilleGeometry = extrudedPanel(0.62, 0.12, 0.045, 0.035);
const lampHousingGeometry = extrudedPanel(0.86, 0.16, 0.03, 0.04);
const lampGeometry = new THREE.CapsuleGeometry(0.055, 0.16, 8, 24);
const tailGeometry = new THREE.CapsuleGeometry(0.045, 0.2, 8, 24);

function Wheel({ side, z }: { side: 1 | -1; z: number }) {
  const axle = side === 1 ? -Math.PI / 2 : Math.PI / 2;
  return (
    <group position={[side * WHEEL_X, WHEEL_Y, z]} rotation={[0, 0, axle]}>
      <mesh castShadow>
        <cylinderGeometry args={[TIRE_RADIUS, TIRE_RADIUS, TIRE_WIDTH - 0.08, 32]} />
        <meshStandardMaterial color="#141618" roughness={0.84} metalness={0.05} />
      </mesh>
      <mesh position={[0, (TIRE_WIDTH - 0.08) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.07, 32]} />
        <meshStandardMaterial color="#1b1e22" roughness={0.9} metalness={0.04} />
      </mesh>
      <mesh position={[0, -((TIRE_WIDTH - 0.08) / 2), 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.07, 32]} />
        <meshStandardMaterial color="#1b1e22" roughness={0.9} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 28]} />
        <meshStandardMaterial color="#d5dae2" roughness={0.28} metalness={0.84} />
      </mesh>
      <mesh position={[0, 0.108, 0]} castShadow>
        <cylinderGeometry args={[0.078, 0.078, 0.036, 24]} />
        <meshStandardMaterial color="#e7ebf0" roughness={0.22} metalness={0.78} />
      </mesh>
    </group>
  );
}

function Mirror({ side, color }: { side: 1 | -1; color: string }) {
  return (
    <group position={[side * 0.86, 1.03, 0.46]}>
      <mesh position={[side * -0.045, -0.03, 0.01]} rotation={[0.5, 0, side * 0.7]} castShadow>
        <cylinderGeometry args={[0.012, 0.018, 0.09, 16]} />
        <meshStandardMaterial color="#2c3136" roughness={0.42} metalness={0.62} />
      </mesh>
      <mesh castShadow scale={[0.1, 0.07, 0.14]}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.58} />
      </mesh>
    </group>
  );
}

export function DetailedCar({
  position,
  rotation,
  color,
}: {
  position: readonly [number, number, number];
  rotation: number;
  color: string;
}) {
  return (
    <group name="detailed-car" position={[position[0], position[1], position[2]]} rotation={[0, rotation, 0]}>
      <mesh name="car-body" geometry={bodyGeometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.58} />
      </mesh>
      <mesh name="car-glass" geometry={glassGeometry} castShadow>
        <meshStandardMaterial color="#9eb4c6" roughness={0.08} metalness={0.15} />
      </mesh>
      <mesh geometry={grilleGeometry} position={[0, 0.52, 2.17]} castShadow>
        <meshStandardMaterial color="#1a1d22" roughness={0.45} metalness={0.55} />
      </mesh>
      <mesh geometry={lampHousingGeometry} position={[0, 0.68, -2.18]} castShadow>
        <meshStandardMaterial color="#14171b" roughness={0.4} metalness={0.5} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh
          key={`head-${side}`}
          geometry={lampGeometry}
          position={[side * 0.38, 0.68, 2.16]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[1, 1, 0.48]}
          castShadow
        >
          <meshStandardMaterial color="#f3f0e4" roughness={0.14} metalness={0.12} emissive="#fff1cc" emissiveIntensity={0.28} />
        </mesh>
      ))}
      {[1, -1].map((side) => (
        <mesh
          key={`tail-${side}`}
          geometry={tailGeometry}
          position={[side * 0.4, 0.68, -2.215]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[1, 1, 0.62]}
          castShadow
        >
          <meshStandardMaterial color="#c43232" roughness={0.22} metalness={0.18} emissive="#6a1418" emissiveIntensity={0.35} />
        </mesh>
      ))}
      <Mirror side={1} color={color} />
      <Mirror side={-1} color={color} />
      {[0.28, -0.62].map((z) =>
        ([1, -1] as const).map((side) => (
          <mesh key={`handle-${side}-${z}`} position={[side * 0.875, 0.8, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.015, 0.07, 6, 16]} />
            <meshStandardMaterial color="#3a4046" roughness={0.35} metalness={0.7} />
          </mesh>
        )),
      )}
      <mesh position={[0.26, 1.58, -0.32]} castShadow>
        <cylinderGeometry args={[0.007, 0.007, 0.26, 16]} />
        <meshStandardMaterial color="#22262b" roughness={0.4} metalness={0.65} />
      </mesh>
      <Wheel side={1} z={FRONT_AXLE} />
      <Wheel side={-1} z={FRONT_AXLE} />
      <Wheel side={1} z={REAR_AXLE} />
      <Wheel side={-1} z={REAR_AXLE} />
    </group>
  );
}
