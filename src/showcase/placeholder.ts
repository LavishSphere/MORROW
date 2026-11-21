import {
  BARRIER_CURB_ID,
  CURB_POSITION,
  INTERVENTION_RAMP_ID,
  ROUTE_POINTS,
} from "./layout";
import type { Barrier, RouteGeometry } from "./types";

/** Illustrative scenario from data/wellesley/demo-dataset.json. */
export const PLACEHOLDER_BARRIERS: readonly Barrier[] = [
  {
    id: BARRIER_CURB_ID,
    label: "Missing curb ramp",
    kind: "missing_ramp",
    position: CURB_POSITION,
    interventionId: INTERVENTION_RAMP_ID,
  },
];

export const PLACEHOLDER_ROUTE: RouteGeometry = {
  points: ROUTE_POINTS,
};
