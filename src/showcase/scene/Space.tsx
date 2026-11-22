import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LOOK_SUN, lookSky } from "./look";

/** Pale haze where the sky meets the ground. Fog uses the same color. */
export const HORIZON_HAZE = "#cfe0ea";

/** Same direction as the key light in TownScene, so shadows match the sun. */
const SUN_DIRECTION = new THREE.Vector3(...(LOOK_SUN ?? [40, 52, 18])).normalize();

const VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Daylight sky: deep blue zenith fading to a hazy horizon, a soft sun
// glow, and procedural cumulus clouds that drift slowly. No textures, so
// it renders offline and costs one fragment shader.
const FRAGMENT = `
uniform float uTime;
uniform vec3 uSun;
varying vec3 vDir;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amp * noise(p);
    p = turn * p * 2.02;
    amp *= 0.5;
  }
  return value;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;

  // Atmosphere: haze at the horizon, clear blue overhead.
  vec3 zenith = vec3(0.15, 0.36, 0.74);
  vec3 midSky = vec3(0.38, 0.60, 0.89);
  vec3 horizon = vec3(0.81, 0.88, 0.92);
  float up = clamp(h, 0.0, 1.0);
  vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.28, up));
  col = mix(col, zenith, smoothstep(0.28, 0.95, up));
  // smoothstep is undefined when the first edge is greater than the second,
  // and that NaN painted the whole dome black.
  col = mix(col, horizon * 0.96, 1.0 - smoothstep(-0.2, 0.0, h));

  // Sun: wide warm glow, tighter halo, small bright disk.
  float sun = max(dot(dir, uSun), 0.0);
  col += vec3(1.0, 0.90, 0.74) * pow(sun, 6.0) * 0.18;
  col += vec3(1.0, 0.95, 0.86) * pow(sun, 80.0) * 0.45;
  col = mix(col, vec3(1.0, 0.99, 0.95), smoothstep(0.9993, 0.9997, sun));

  // Clouds on a high plane above the city.
  if (h > 0.0) {
    vec2 drift = vec2(uTime * 0.006, uTime * 0.002);
    vec2 uv = dir.xz / (h + 0.1) * 0.85 + drift;
    float shape = fbm(uv * 1.5);
    float cover = smoothstep(0.5, 0.78, shape);
    // Darker undersides where the cloud is thick, lit edges toward the sun.
    float thick = fbm(uv * 1.5 + uSun.xz * 0.12);
    vec3 cloud = mix(vec3(1.0), vec3(0.70, 0.75, 0.82), smoothstep(0.45, 0.85, thick));
    cloud += vec3(1.0, 0.92, 0.80) * pow(sun, 5.0) * 0.22;
    float fadeAtHorizon = smoothstep(0.015, 0.22, h);
    col = mix(col, cloud, cover * fadeAtHorizon * 0.92);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

type SkyProps = {
  /** Clouds hold still when reduced motion is on. */
  reducedMotion?: boolean;
  /** Keep the dome around the viewer. The town is wider than a fixed sphere. */
  follow?: boolean;
};

export function Sky({ reducedMotion = false, follow = false }: SkyProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSun: { value: SUN_DIRECTION.clone() },
    }),
    [],
  );

  useFrame(({ camera }, delta) => {
    if (follow && mesh.current) mesh.current.position.copy(camera.position);
    if (reducedMotion) return;
    uniforms.uTime.value += delta;
  });

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={-20} raycast={() => null}>
      <sphereGeometry args={[900, 48, 32]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={lookSky(FRAGMENT)}
      />
    </mesh>
  );
}
