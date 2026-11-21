/** Logo blue sampled from the MORROW mark. Callers can override it. */
export const LOGO_BLUE = "#1488FF";

/**
 * Short local-space street. Y is up. These are placeholders until a route
 * polyline arrives from the scene.
 */
export const PLACEHOLDER_STREET: readonly (readonly [number, number, number])[] = [
  [-3.6, 0.12, 1.55],
  [-1.15, 0.12, 0.42],
  [1.2, 0.12, -0.48],
  [3.55, 0.12, -1.4],
];

const alongStart = PLACEHOLDER_STREET[1];
const alongEnd = PLACEHOLDER_STREET[2];
const runX = alongEnd[0] - alongStart[0];
const runZ = alongEnd[2] - alongStart[2];
const runLength = Math.hypot(runX, runZ) || 1;
const dirX = runX / runLength;
const dirZ = runZ / runLength;

/** Yaw that points a mesh's local +X along the placeholder street. */
export const STREET_HEADING = Math.atan2(-dirZ, dirX);

const midX = (alongStart[0] + alongEnd[0]) / 2;
const midZ = (alongStart[2] + alongEnd[2]) / 2;
/** Sideways unit from the centerline toward the sidewalk (local -Z). */
const sideX = dirZ;
const sideZ = -dirX;

const ROAD_Y = 0.15;

export const CURB_LENGTH = 1.8;
export const CURB_HEIGHT = 0.32;
export const CURB_DEPTH = 0.4;
export const CURB_SIDE_OFFSET = 0.96;
export const RAMP_SIDE_OFFSET = 0.22;
export const RAMP_WIDTH = 1.15;
export const RAMP_RISE = CURB_HEIGHT;
/** From the street-side toe to the curb face, tucked a little underneath. */
export const RAMP_RUN = CURB_SIDE_OFFSET - CURB_DEPTH / 2 - RAMP_SIDE_OFFSET + 0.02;

export const CURB_POSITION: readonly [number, number, number] = [
  midX + sideX * CURB_SIDE_OFFSET,
  ROAD_Y + CURB_HEIGHT / 2,
  midZ + sideZ * CURB_SIDE_OFFSET,
];

/** Low end of the ramp. Local -Z climbs toward the curb. */
export const RAMP_POSITION: readonly [number, number, number] = [
  midX + sideX * RAMP_SIDE_OFFSET,
  ROAD_Y,
  midZ + sideZ * RAMP_SIDE_OFFSET,
];
