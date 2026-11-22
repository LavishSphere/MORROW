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
  /** Scene [x, z] → [longitude, latitude], the inverse of project. */
  unproject: (x: number, z: number) => readonly [number, number];
  /** Center of every building, for "what is near this fix". */
  buildingPoints: [number, number][];
  /** OpenStreetMap building type for each entry of buildingPoints. */
  buildingKinds: string[];
  /** Path2D strings in scene units (x right, z down). */
  roads: string;
  walks: string;
  /** Lakes, ponds, and brooks. The shoreline, not a defect. */
  water: string;
  buildings: string;
  streets: NamedSegment[];
  places: NamedPlace[];
  /** Rail lines as Path2D strings, with line colour; tunnels draw dashed. */
  rail?: RailPath[];
  /** Tallest building top near the map's center, in scene units. */
  skyline?: number;
};

export type RailPath = { d: string; colour: string | null; tunnel: boolean };

export type CameraPose = {
  /** What the camera looks at, on the ground. */
  x: number;
  z: number;
  /** Ground-plane view direction. */
  dirX: number;
  dirZ: number;
  /** Distance from the camera to what it looks at. */
  distance: number;
  /** Where the camera itself is, for what it can see. */
  eyeX?: number;
  eyeY?: number;
  eyeZ?: number;
  /** Vertical field of view in degrees, and width over height. */
  fov?: number;
  aspect?: number;
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
  fly: { x: number; z: number; id: number; distance?: number; instant?: boolean; overhead?: boolean } | null;
  pin: AddressPin | null;
  /** The city on screen, for labels and offline drafts. */
  placeLabel: string;
  /** The city or town the map is in, for proposals (e.g. "Wellesley, MA"). */
  town: string;
  /** True while more of a loaded city is downloading as you explore. */
  loadingMore: boolean;
};

let state: State = {
  map: null,
  pose: { x: 0, z: 0, dirX: 0, dirZ: -1, distance: 60 },
  fly: null,
  pin: null,
  placeLabel: "Wellesley, MA",
  town: "Wellesley, MA",
  loadingMore: false,
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

/** Every change, the camera pose included: re-renders a few times a second while moving. */
export function useCityState() {
  return useSyncExternalStore(subscribe, getCityState, getCityState);
}

/**
 * One piece of the state. The component re-renders only when that piece
 * changes, so overlays that never read the pose stay still while the
 * camera moves. `select` must return a stored value or a primitive.
 */
export function useCitySelector<T>(select: (state: State) => T): T {
  const get = () => select(state);
  return useSyncExternalStore(subscribe, get, get);
}

/** Listen for any change outside React; returns the unsubscribe. */
export function subscribeCity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishMap(map: CityMap) {
  // A new map: an old address pin would point into the wrong place.
  emit({ map, pin: null });
}

export function setLoadingMore(loadingMore: boolean) {
  if (state.loadingMore !== loadingMore) emit({ loadingMore });
}

export function setPlaceLabel(placeLabel: string, town: string = placeLabel) {
  if (state.placeLabel !== placeLabel || state.town !== town) emit({ placeLabel, town });
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
    Math.abs(p.distance - pose.distance) < 0.05 &&
    Math.abs((p.eyeY ?? 0) - (pose.eyeY ?? 0)) < 0.05 &&
    Math.abs((p.aspect ?? 0) - (pose.aspect ?? 0)) < 0.01
  ) {
    return;
  }
  emit({ pose });
}

/** Towers taller than this (about 60 m) lift a view above the rooftops. */
const TALL_SKYLINE = 8.5;
/** Sine of the overhead view's 58° downward look (see CameraRig). */
const OVERHEAD_SIN = Math.sin((58 * Math.PI) / 180);

/**
 * How to look at a spot `distance` away. Among real towers (a downtown)
 * the view rises above their roofs and looks down, so it does not start
 * inside a building.
 */
export function viewOver(skyline: number | undefined, distance: number) {
  if (!skyline || skyline < TALL_SKYLINE) return { distance };
  return { distance: Math.max(distance, (skyline * 1.5 + 6) / OVERHEAD_SIN), overhead: true };
}

/** Glide the camera to a spot; `instant` teleports instead. */
/** `overhead` also tilts the view to look down, so buildings do not hide the spot. */
export function flyTo(
  x: number,
  z: number,
  options: { distance?: number; instant?: boolean; overhead?: boolean } = {},
) {
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
