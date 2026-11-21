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

function paintNoise(
  paint: (x: number, y: number, n: number) => void,
  count: number,
) {
  for (let i = 0; i < count; i += 1) {
    paint(Math.random() * 512, Math.random() * 512, Math.random());
  }
}

export function createAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 18);
  if (!context) return texture;
  context.fillStyle = "#2a2e34";
  context.fillRect(0, 0, 512, 512);
  paintNoise((x, y, n) => {
    const g = 36 + Math.floor(n * 28);
    context.fillStyle = `rgb(${g},${g + 2},${g + 4})`;
    context.fillRect(x, y, 1 + n * 2, 1 + n);
  }, 8000);
  context.strokeStyle = "rgba(18,18,20,0.45)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(40, 0);
  context.bezierCurveTo(80, 180, 20, 320, 70, 512);
  context.stroke();
  texture.needsUpdate = true;
  return texture;
}

export function createConcreteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 12);
  if (!context) return texture;
  context.fillStyle = "#b7b2a8";
  context.fillRect(0, 0, 512, 512);
  paintNoise((x, y, n) => {
    const g = 150 + Math.floor(n * 50);
    context.fillStyle = `rgba(${g},${g - 4},${g - 10},0.45)`;
    context.fillRect(x, y, 2, 2);
  }, 5000);
  context.strokeStyle = "rgba(90,86,80,0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, 170);
  context.lineTo(512, 170);
  context.moveTo(0, 340);
  context.lineTo(512, 340);
  context.stroke();
  texture.needsUpdate = true;
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
