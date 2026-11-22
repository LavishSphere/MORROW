import type { CityMap } from "./cityStore";

/**
 * How many people live near a fix: an honest, conservative estimate.
 *
 * Homes come from the OpenStreetMap building type of each building within
 * NEAR_METERS, times the U.S. average household size. Buildings with an
 * unknown type ("yes") are not counted, so the estimate errs low.
 */

export const NEAR_METERS = 150;
/** Scene units per metre (see City.tsx). */
const SCENE_PER_METER = 0.14;
const NEAR_UNITS = NEAR_METERS * SCENE_PER_METER;

/** U.S. average household size (Census), people per home. */
export const PEOPLE_PER_HOME = 2.5;

/** Homes per building, by OpenStreetMap building type. */
const HOMES: Record<string, number> = {
  house: 1,
  detached: 1,
  semidetached_house: 1,
  bungalow: 1,
  residential: 1,
  terrace: 4,
  apartments: 12,
};
/** A dormitory counts residents directly. */
const DORM_RESIDENTS = 60;

export const PEOPLE_METHOD = `Estimate: homes within ${NEAR_METERS} m (OpenStreetMap building types) × ${PEOPLE_PER_HOME} people per home (U.S. average). Houses count as 1 home, terraces as 4, apartment buildings as 12, dorms as ${DORM_RESIDENTS} residents. Buildings with no type are not counted. Not a census.`;

/** Indices of buildings within NEAR_METERS of a point. */
export function buildingsNear(map: CityMap, x: number, z: number) {
  const out: number[] = [];
  map.buildingPoints.forEach(([bx, bz], i) => {
    if (Math.hypot(bx - x, bz - z) < NEAR_UNITS) out.push(i);
  });
  return out;
}

/** Estimated residents of a set of buildings. */
export function peopleIn(map: CityMap, buildings: Iterable<number>) {
  let people = 0;
  for (const i of buildings) {
    const kind = map.buildingKinds[i] ?? "yes";
    if (kind === "dormitory") people += DORM_RESIDENTS;
    else people += (HOMES[kind] ?? 0) * PEOPLE_PER_HOME;
  }
  return Math.round(people);
}

/** Estimated residents near a point. */
export function peopleNear(map: CityMap, x: number, z: number) {
  return peopleIn(map, buildingsNear(map, x, z));
}

/** Named places near a point, nearest first. */
export function placesNear(map: CityMap, x: number, z: number, limit = 3) {
  return map.places
    .map((place) => ({ place, d: Math.hypot(place.x - x, place.z - z) }))
    .filter((entry) => entry.d < NEAR_UNITS)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((entry) => entry.place.name);
}
