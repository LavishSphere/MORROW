import * as THREE from "three";
import { BLACK } from "./palette";

function createToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([
    32, 32, 32, 255, 32, 32, 32, 255, 168, 168, 168, 255, 255, 255, 255, 255,
  ]);
  const texture = new THREE.DataTexture(data, 4, 1);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const toonGradient = createToonGradient();

export function ToonMaterial({
  color,
  emissive = BLACK,
  emissiveIntensity = 0,
  side = THREE.FrontSide,
}: {
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  side?: THREE.Side;
}) {
  return (
    <meshToonMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      gradientMap={toonGradient}
      side={side}
    />
  );
}
