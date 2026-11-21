import * as THREE from "three";
import { BLACK } from "./palette";

export function Surface({
  color,
  roughness = 0.82,
  metalness = 0.04,
  emissive = BLACK,
  emissiveIntensity = 0,
  map,
  side = THREE.FrontSide,
}: {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  map?: THREE.Texture;
  side?: THREE.Side;
}) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      map={map}
      side={side}
    />
  );
}

export function createFacadeTexture(wall: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  context.fillStyle = wall;
  context.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const lit = (row + col * 2) % 5 === 0;
      context.fillStyle = lit ? "#f0d7a2" : "#1c2836";
      context.fillRect(18 + col * 36, 18 + row * 30, 20, 14);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#3d7a34";
    context.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i += 1) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const shade = 40 + Math.floor(Math.random() * 50);
      context.fillStyle = `rgb(${18 + shade * 0.2}, ${90 + shade}, ${28 + shade * 0.15})`;
      context.fillRect(x, y, 2, 5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(28, 28);
  return texture;
}
