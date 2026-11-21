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
  vec3 zenith = vec3(0.30, 0.56, 0.96);
  vec3 high = vec3(0.48, 0.72, 0.97);
  vec3 horizon = vec3(0.86, 0.91, 0.95);
  vec3 warm = vec3(0.98, 0.94, 0.84);
  float lift = smoothstep(-0.03, 0.58, h);
  vec3 col = mix(horizon, zenith, lift);
  float mid = smoothstep(0.02, 0.26, h) * (1.0 - smoothstep(0.26, 0.72, h));
  col = mix(col, high, mid);
  col = mix(col, warm, exp(-8.0 * abs(h)) * 0.34);
  vec3 sunDir = normalize(vec3(32.0, 44.0, 18.0));
  float sun = max(dot(dir, sunDir), 0.0);
  col += vec3(1.0, 0.98, 0.92) * pow(sun, 72.0) * 0.7;
  col += warm * pow(sun, 5.0) * 0.2;
  vec3 field = vec3(0.46, 0.56, 0.42);
  col = mix(col, field, smoothstep(0.02, -0.42, h) * 0.8);
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
