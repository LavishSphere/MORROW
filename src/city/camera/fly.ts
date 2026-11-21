import * as THREE from "three";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Opening pose: above the blocks, field of view 52. */
export function placeSpectator(camera: THREE.Camera) {
  camera.position.set(7.2, 5.4, 8.6);
  if (camera instanceof THREE.PerspectiveCamera && camera.fov !== 52) {
    camera.fov = 52;
    camera.updateProjectionMatrix();
  }
}

/** Unit vector the spectator is facing. Pitch raises and lowers the nose. */
export function writeGaze(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  const cosPitch = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch);
}

/**
 * WASD follows the facing direction, including pitch.
 * A and D strafe on the level perpendicular. Space and Shift are world up and down.
 * The result is a unit vector, or zero when nothing is held.
 */
export function flyVelocity(
  keys: Record<string, boolean>,
  yaw: number,
  pitch: number,
  forward: THREE.Vector3,
  right: THREE.Vector3,
  velocity: THREE.Vector3,
): THREE.Vector3 {
  writeGaze(yaw, pitch, forward);
  right.crossVectors(WORLD_UP, forward);
  if (right.lengthSq() < 1e-8) {
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  } else {
    right.normalize();
  }
  velocity.set(0, 0, 0);
  if (keys.KeyW) velocity.add(forward);
  if (keys.KeyS) velocity.sub(forward);
  if (keys.KeyD) velocity.add(right);
  if (keys.KeyA) velocity.sub(right);
  if (keys.Space) velocity.y += 1;
  if (keys.ShiftLeft || keys.ShiftRight) velocity.y -= 1;
  if (velocity.lengthSq() > 0) velocity.normalize();
  return velocity;
}
