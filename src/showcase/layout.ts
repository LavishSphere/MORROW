export const BARRIER_CURB_ID = "barrier-curb-1";
export const INTERVENTION_RAMP_ID = "intervention-ramp-1";

export const ROAD_TOP = 0.04;
export const SIDEWALK_TOP = 0.14;

export const CROSSING_Z = 10;

export const CURB_POSITION = [4.85, SIDEWALK_TOP + 0.14, CROSSING_Z] as const;
export const CURB_SIZE = [0.5, 0.28, 1.7] as const;

/** Center of the ramp wedge. Local +X is the high sidewalk end. */
export const RAMP_POSITION = [4.35, ROAD_TOP, CROSSING_Z] as const;
export const RAMP_LENGTH = 1.35;
export const RAMP_RISE = SIDEWALK_TOP - ROAD_TOP + 0.02;
export const RAMP_WIDTH = 1.55;

export const ROUTE_POINTS = [
  [0, 0.1, -22],
  [0, 0.1, -8],
  [0, 0.1, CROSSING_Z],
  [0, 0.1, 18],
  [0, 0.1, 28],
] as const;

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
