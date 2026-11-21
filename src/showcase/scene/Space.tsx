import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LOGO_BLUE } from "../palette";

const VOID_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const VOID_FRAGMENT = `
uniform vec3 uBlue;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float below = smoothstep(-0.2, -0.95, dir.y);
  float glow = pow(below, 1.7);
  gl_FragColor = vec4(uBlue * glow * 0.45, 1.0);
}
`;

function starField() {
  const count = 540;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const blue = new THREE.Color(LOGO_BLUE);
  const white = new THREE.Color("#ffffff");
  for (let index = 0; index < count; index += 1) {
    const radius = 26 + Math.random() * 52;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const color = Math.random() > 0.74 ? blue : white;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function starTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.75)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function Space({ reducedMotion }: { reducedMotion: boolean }) {
  const stars = useRef<THREE.Points>(null);
  const geometry = useMemo(() => starField(), []);
  const map = useMemo(() => starTexture(), []);
  const uniforms = useMemo(() => ({ uBlue: { value: new THREE.Color(LOGO_BLUE) } }), []);

  useFrame(({ clock }) => {
    if (!stars.current || reducedMotion) return;
    stars.current.rotation.y = clock.elapsedTime * 0.012;
  });

  return (
    <group>
      <mesh frustumCulled={false} renderOrder={-20}>
        <sphereGeometry args={[88, 28, 18]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
          toneMapped={false}
          uniforms={uniforms}
          vertexShader={VOID_VERTEX}
          fragmentShader={VOID_FRAGMENT}
        />
      </mesh>
      <points ref={stars} geometry={geometry} frustumCulled={false}>
        <pointsMaterial
          map={map ?? undefined}
          transparent
          depthWrite={false}
          size={0.42}
          sizeAttenuation
          vertexColors
          toneMapped={false}
        />
      </points>
    </group>
  );
}
