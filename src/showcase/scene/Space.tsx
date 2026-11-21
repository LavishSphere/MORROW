import { useMemo } from "react";
import * as THREE from "three";

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = `
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 zenith = vec3(0.62, 0.90, 0.95);
  vec3 horizon = vec3(0.55, 0.84, 0.90);
  vec3 glow = vec3(0.45, 0.92, 0.96);
  float lift = smoothstep(-0.05, 0.55, h);
  vec3 col = mix(horizon, zenith, lift);
  col += glow * exp(-6.0 * abs(h)) * 0.45;
  vec3 sunDir = normalize(vec3(18.0, 8.0, -6.0));
  float sun = max(dot(dir, sunDir), 0.0);
  col += glow * pow(sun, 28.0) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function Sky() {
  const uniforms = useMemo(() => ({}), []);
  return (
    <mesh frustumCulled={false} renderOrder={-20} raycast={() => null}>
      <sphereGeometry args={[250, 96, 64]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
      />
    </mesh>
  );
}
