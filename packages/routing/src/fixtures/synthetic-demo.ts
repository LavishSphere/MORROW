import type { PedestrianScenario } from "../types.js";

/**
 * Synthetic campus-block graph for algorithm tests and local demos.
 * NOT Wellesley data — does not ship as judge-facing geography.
 *
 * Layout (meters, planar):
 *
 *   home(0,0) --e_short_blocked(40m, inaccessible)-- library(40,0)
 *      |                                               |
 *   e_south(30m)                                   e_east(30m)
 *      |                                               |
 *   corner(0,30) --e_bottom(40m)-- mid(40,30) --e_spur-- cafe(70,30)
 *                      \-- e_diag(50m) --/  (accessible detour via mid)
 *
 * Wheelchair before: home → corner → mid → library  = 30+40+30 = 100m
 * After installing ramp on e_short_blocked: home → library = 40m
 */
export const SYNTHETIC_SCENARIO_ID = "synthetic-demo-01";
export const SYNTHETIC_BARRIER_ID = "synthetic-missing-ramp-01";
export const SYNTHETIC_INTERVENTION_ID = "synthetic-install-ramp-01";
export const SYNTHETIC_BLOCKED_EDGE_ID = "e_short_blocked";

export const syntheticDemoScenario: PedestrianScenario = {
  id: SYNTHETIC_SCENARIO_ID,
  label: "Synthetic wheelchair trip past a blocked curb cut",
  originId: "home",
  destinationId: "library",
  barrierId: SYNTHETIC_BARRIER_ID,
  interventionId: SYNTHETIC_INTERVENTION_ID,
  evidenceStatus: "illustrative",
  assumptions: [
    "Synthetic fixture graph for unit tests — not Wellesley geography.",
  ],
  graphChanges: [
    {
      edgeId: SYNTHETIC_BLOCKED_EDGE_ID,
      accessible: true,
    },
  ],
  graph: {
    nodes: [
      { id: "home", coordinates: [0, 0], label: "Home" },
      { id: "library", coordinates: [40, 0], label: "Library" },
      { id: "corner", coordinates: [0, 30], label: "Corner" },
      { id: "mid", coordinates: [40, 30], label: "Mid block" },
      { id: "cafe", coordinates: [70, 30], label: "Cafe" },
    ],
    edges: [
      {
        id: SYNTHETIC_BLOCKED_EDGE_ID,
        from: "home",
        to: "library",
        lengthMeters: 40,
        wheelchairAccessible: false,
      },
      {
        id: "e_south",
        from: "home",
        to: "corner",
        lengthMeters: 30,
        wheelchairAccessible: true,
      },
      {
        id: "e_bottom",
        from: "corner",
        to: "mid",
        lengthMeters: 40,
        wheelchairAccessible: true,
      },
      {
        id: "e_east",
        from: "mid",
        to: "library",
        lengthMeters: 30,
        wheelchairAccessible: true,
      },
      {
        id: "e_diag",
        from: "corner",
        to: "library",
        lengthMeters: 80,
        wheelchairAccessible: true,
      },
      {
        id: "e_spur",
        from: "mid",
        to: "cafe",
        lengthMeters: 30,
        wheelchairAccessible: true,
      },
    ],
  },
};

/** Expected recomputed meters for the synthetic scenario (derived, not UI constants). */
export const SYNTHETIC_EXPECTED = {
  beforeMeters: 100,
  afterMeters: 40,
} as const;
