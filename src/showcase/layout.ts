export const BARRIER_CURB_ID = "barrier-curb-1";
export const INTERVENTION_RAMP_ID = "intervention-ramp-1";

export const GRASS_Y = 0.045;
export const STREET_TOP = 0.1;
export const SIDEWALK_TOP = 0.22;

export const STREET_Z0 = -3.55;
export const STREET_Z1 = 3.75;
export const STREET_LENGTH = STREET_Z1 - STREET_Z0;
export const STREET_Z_CENTER = (STREET_Z0 + STREET_Z1) / 2;

export const CROSSING_Z = 0.32;
export const CROSSING_HALF = 0.5;
export const GAP_Z0 = CROSSING_Z - CROSSING_HALF;
export const GAP_Z1 = CROSSING_Z + CROSSING_HALF;

export const CURB_POSITION = [1.16, SIDEWALK_TOP + 0.18, CROSSING_Z] as const;
export const CURB_SIZE = [0.46, 0.36, 0.8] as const;

/** Center of the ramp wedge. Local +X is the high sidewalk end. */
export const RAMP_POSITION = [0.78, STREET_TOP + 0.01, CROSSING_Z] as const;
export const RAMP_LENGTH = 0.58;
export const RAMP_RISE = SIDEWALK_TOP - STREET_TOP + 0.02;
export const RAMP_WIDTH = 0.84;

export const ROUTE_POINTS = [
  [0, 0.24, STREET_Z0 + 0.28],
  [0, 0.24, -1.25],
  [0, 0.24, CROSSING_Z],
  [0, 0.24, 1.85],
  [0, 0.24, STREET_Z1 - 0.28],
] as const;

export const ISLAND_SEGMENTS = 14;
export const ISLAND_TOP_RADII = [
  7.35, 6.5, 7.1, 6.2, 6.9, 7.55, 6.35, 5.9, 7.2, 6.65, 5.85, 6.8, 7.4, 6.4,
] as const;

export function islandPoint(index: number, scale = 1): [number, number, number] {
  const count = ISLAND_TOP_RADII.length;
  const radius = ISLAND_TOP_RADII[index % count] * scale;
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

/** Phase 1 keeps invented footprints even when an extract is passed in. */
export function footprintSource(geoJson: unknown): "invented" {
  if (
    typeof geoJson === "object" &&
    geoJson !== null &&
    "type" in geoJson &&
    (geoJson as { type?: unknown }).type === "FeatureCollection"
  ) {
    return "invented";
  }
  return "invented";
}
