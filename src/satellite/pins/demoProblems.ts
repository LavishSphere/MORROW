import curbUrl from "../town/curb.jpg";
import rampUrl from "../town/ramp.jpg";
import crossingAfterUrl from "../photos/crossing-after.jpg";
import crossingBeforeUrl from "../photos/crossing-before.jpg";
import potholeAfterUrl from "../photos/pothole-after.jpg";
import potholeBeforeUrl from "../photos/pothole-before.jpg";
import sidewalkAfterUrl from "../photos/sidewalk-after.jpg";
import sidewalkBeforeUrl from "../photos/sidewalk-before.jpg";

export type ProblemKind = "ramp" | "pothole" | "sidewalk" | "crossing";

export type DemoProblem = {
  id: string;
  longitude: number;
  latitude: number;
  title: string;
  kind: ProblemKind;
  beforeLabel: string;
  afterLabel: string;
  beforePhoto: string;
  afterPhoto: string;
  beforeMeters: number | null;
  afterMeters: number | null;
};

/** Illustrative stops. Coordinates for the seeded barrier are filled in by the hook. */
export const DEMO_PROBLEMS: readonly DemoProblem[] = [
  {
    id: "wellesley-barrier-campus-path-01",
    longitude: -71.3078763,
    latitude: 42.2931263,
    title: "Missing curb ramp",
    kind: "ramp",
    beforeLabel: "Curb",
    afterLabel: "Ramp",
    beforePhoto: curbUrl,
    afterPhoto: rampUrl,
    beforeMeters: null,
    afterMeters: 180,
  },
  {
    id: "illustrative-pothole",
    longitude: -71.3051,
    latitude: 42.2954,
    title: "Pothole",
    kind: "pothole",
    beforeLabel: "Pothole",
    afterLabel: "Filled",
    beforePhoto: potholeBeforeUrl,
    afterPhoto: potholeAfterUrl,
    beforeMeters: 640,
    afterMeters: 180,
  },
  {
    id: "illustrative-blocked-crossing",
    longitude: -71.3012,
    latitude: 42.2947,
    title: "Blocked crossing",
    kind: "crossing",
    beforeLabel: "Blocked",
    afterLabel: "Open",
    beforePhoto: crossingBeforeUrl,
    afterPhoto: crossingAfterUrl,
    beforeMeters: 890,
    afterMeters: 240,
  },
  {
    id: "illustrative-broken-sidewalk",
    longitude: -71.3038,
    latitude: 42.2918,
    title: "Broken sidewalk",
    kind: "sidewalk",
    beforeLabel: "Broken",
    afterLabel: "Repaired",
    beforePhoto: sidewalkBeforeUrl,
    afterPhoto: sidewalkAfterUrl,
    beforeMeters: 410,
    afterMeters: 150,
  },
];

export function demoProblem(id: string | null): DemoProblem | undefined {
  if (!id) return undefined;
  return DEMO_PROBLEMS.find((problem) => problem.id === id);
}
