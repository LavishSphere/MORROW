import type { SceneProjector } from "../../showcase/geo";
import { defaultProjector } from "../../showcase/layout";

/** Street problem the city can select and play through to a fix. */
export type Kind = "ramp" | "pothole" | "sidewalk" | "crossing";

export type Issue = {
  id: string;
  longitude: number;
  latitude: number;
  title: string;
  kind: Kind;
  /** Copy shown once the fix animation has finished. */
  fix: string;
};

/**
 * The four Wellesley issues. The curb ramp keeps the demo-dataset barrier id.
 * The other three are illustrative and are not field surveys.
 */
export const ISSUES: readonly Issue[] = [
  {
    id: "wellesley-barrier-campus-path-01",
    longitude: -71.3078763,
    latitude: 42.2931263,
    title: "Missing curb ramp",
    kind: "ramp",
    fix: "Replace the curb with a ramp so the footway meets the street.",
  },
  {
    id: "illustrative-pothole",
    longitude: -71.3020179,
    latitude: 42.296094,
    title: "Pothole",
    kind: "pothole",
    fix: "Fill the pothole so the lane is even again.",
  },
  {
    id: "illustrative-blocked-crossing",
    longitude: -71.3015621,
    latitude: 42.2941831,
    title: "Blocked crossing",
    kind: "crossing",
    fix: "Clear the crossing and open the curb ramp.",
  },
  {
    id: "illustrative-broken-sidewalk",
    longitude: -71.3035974,
    latitude: 42.2919081,
    title: "Uneven sidewalk",
    kind: "sidewalk",
    fix: "Level the uneven slabs into one continuous sidewalk.",
  },
];

/**
 * Local [x, y, z] for an issue. Y defaults to 0.08, just above the road ribbon.
 * Pass the city projector when the scene is not using `defaultProjector`.
 */
export function place(
  issue: Issue,
  projector: SceneProjector = defaultProjector,
  y = 0.08,
): [number, number, number] {
  const [x, , z] = projector.project3(issue.longitude, issue.latitude, y);
  return [x, y, z];
}
