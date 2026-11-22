import { useSyncExternalStore } from "react";

/**
 * Shared state between the 3D city (inside the canvas) and the DOM
 * overlays beside it (minimap, location label). The canvas publishes the
 * map and where the camera is; the minimap can ask the camera to fly.
 */

export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type NamedSegment = { name: string; ax: number; az: number; bx: number; bz: number };
export type NamedPlace = { name: string; x: number; z: number };

/** Longitude / latitude box of the loaded map. */
export type GeoBounds = { west: number; south: number; east: number; north: number };

export type CityMap = {
  bounds: Bounds;
  geoBounds: GeoBounds;
  /** Longitude/latitude → scene [x, z] for this map. */
  project: (lon: number, lat: number) => readonly [number, number];
  /** Center of every building, for "what is near this fix". */
  buildingPoints: [number, number][];
  /** Path2D strings in scene units (x right, z down). */
  roads: string;
  walks: string;
  buildings: string;
  streets: NamedSegment[];
  places: NamedPlace[];
};

export type CameraPose = {
  /** What the camera looks at, on the ground. */
  x: number;
  z: number;
  /** Ground-plane view direction. */
  dirX: number;
  dirZ: number;
  /** Distance from the camera to what it looks at. */
  distance: number;
};

/** A searched address, pinned in the city. */
export type AddressPin = { label: string; x: number; z: number };

type State = {
  map: CityMap | null;
  pose: CameraPose;
  /**
   * A spot the camera should fly to, with a counter so repeats still fire.
   * `distance`, when set, also zooms to that camera distance.
   */
  fly: { x: number; z: number; id: number; distance?: number } | null;
  pin: AddressPin | null;
};

let state: State = {
  map: null,
  pose: { x: 0, z: 0, dirX: 0, dirZ: -1, distance: 60 },
  fly: null,
  pin: null,
};
const listeners = new Set<() => void>();

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCityState() {
  return state;
}

export function useCityState() {
  return useSyncExternalStore(subscribe, getCityState, getCityState);
}

export function publishMap(map: CityMap) {
  // A new map: an old address pin would point into the wrong place.
  emit({ map, pin: null });
}

export function setPin(pin: AddressPin | null) {
  emit({ pin });
}

export function publishPose(pose: CameraPose) {
  const p = state.pose;
  // Skip tiny changes so overlays only re-render when the view moved.
  if (
    Math.abs(p.x - pose.x) < 0.05 &&
    Math.abs(p.z - pose.z) < 0.05 &&
    Math.abs(p.dirX - pose.dirX) < 0.005 &&
    Math.abs(p.dirZ - pose.dirZ) < 0.005 &&
    Math.abs(p.distance - pose.distance) < 0.05
  ) {
    return;
  }
  emit({ pose });
}

export function flyTo(x: number, z: number, options: { distance?: number } = {}) {
  emit({ fly: { x, z, id: (state.fly?.id ?? 0) + 1, ...options } });
}

function distToSegment(x: number, z: number, s: NamedSegment) {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}

/** The street you are on and the nearest named building, if they are close. */
export function whereAmI(map: CityMap, x: number, z: number) {
  let street: string | null = null;
  let best = 7;
  for (const segment of map.streets) {
    const d = distToSegment(x, z, segment);
    if (d < best) {
      best = d;
      street = segment.name;
    }
  }
  let place: string | null = null;
  let nearest = 14;
  for (const p of map.places) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < nearest) {
      nearest = d;
      place = p.name;
    }
  }
  return { street, place };
}
