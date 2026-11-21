import demoDataset from "../../data/wellesley/demo-dataset.json";
import bboxJson from "../../data/wellesley/bbox.json";
import { createProjector, type SceneProjector, type ShowcaseBBox } from "./geo";

/** Stable ids from data/wellesley/demo-dataset.json — do not invent substitutes. */
export const BARRIER_CURB_ID = "wellesley-barrier-campus-path-01";
export const INTERVENTION_RAMP_ID = "wellesley-intervention-ramp-01";

export const INTERVENTION_EDGE_IDS = [
  "osm-way-543827744",
  "osm-way-543827745",
] as const;

export const SHOWCASE_BBOX: ShowcaseBBox = {
  west: bboxJson.west,
  south: bboxJson.south,
  east: bboxJson.east,
  north: bboxJson.north,
  center: bboxJson.center as [number, number],
};

export const defaultProjector: SceneProjector = createProjector(SHOWCASE_BBOX);

export const ROAD_TOP = 0.04;
export const SIDEWALK_TOP = 0.14;

const barrierLonLat = demoDataset.barriers[0].coordinates as [number, number];
const [barrierX, barrierZ] = defaultProjector.project(barrierLonLat[0], barrierLonLat[1]);

/** Barrier sits on the illustrative campus footway edge. */
export const CURB_POSITION = [barrierX, SIDEWALK_TOP + 0.12, barrierZ] as const;
export const CURB_SIZE = [0.42, 0.26, 0.9] as const;

/** Ramp wedge centered just street-side of the curb. */
export const RAMP_POSITION = [barrierX + 0.35, ROAD_TOP, barrierZ] as const;
export const RAMP_LENGTH = 0.95;
export const RAMP_RISE = SIDEWALK_TOP - ROAD_TOP + 0.02;
export const RAMP_WIDTH = 0.85;

/** Fallback route until routing geometry is wired through CanvasSlot. */
export const ROUTE_POINTS = [
  defaultProjector.project3(
    demoDataset.scenario.origin[0],
    demoDataset.scenario.origin[1],
    0.12,
  ),
  defaultProjector.project3(barrierLonLat[0], barrierLonLat[1], 0.12),
  defaultProjector.project3(
    demoDataset.scenario.destination[0],
    demoDataset.scenario.destination[1],
    0.12,
  ),
] as const;

/** Returns whether footprints came from a real FeatureCollection. */
export function footprintSource(geoJson: unknown): "geojson" | "invented" {
  if (
    typeof geoJson === "object" &&
    geoJson !== null &&
    "type" in geoJson &&
    (geoJson as { type?: unknown }).type === "FeatureCollection"
  ) {
    return "geojson";
  }
  return "invented";
}
