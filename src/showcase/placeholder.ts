import { BARRIER_CURB_ID, CURB_POSITION, INTERVENTION_RAMP_ID, ROUTE_POINTS } from "./layout";
import type { Barrier, RouteGeometry } from "./types";

/** Illustrative scenario. These ids are not a surveyed Wellesley defect. */
export const PLACEHOLDER_BARRIERS: readonly Barrier[] = [
  {
    id: BARRIER_CURB_ID,
    label: "Curb",
    kind: "curb",
    position: CURB_POSITION,
    interventionId: INTERVENTION_RAMP_ID,
  },
];

export const PLACEHOLDER_ROUTE: RouteGeometry = {
  points: ROUTE_POINTS,
};
