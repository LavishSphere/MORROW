/**
 * WGS84 → local miniature scene projection for the Wellesley showcase bbox.
 * X is east, Z is south (north is −Z), Y is up. Units are scene meters × scale.
 */

export type ShowcaseBBox = {
  west: number;
  south: number;
  east: number;
  north: number;
  center: readonly [number, number];
};

export type SceneProjector = {
  bbox: ShowcaseBBox;
  /** Scene units per real meter. */
  scale: number;
  /** Project lon/lat to local [x, z] on the ground plane. */
  project: (lon: number, lat: number) => readonly [number, number];
  /** Project lon/lat to [x, y, z] with a ground lift. */
  project3: (
    lon: number,
    lat: number,
    y?: number,
  ) => readonly [number, number, number];
  /** Approximate span of the bbox in scene units (max of width/depth). */
  span: number;
};

const METERS_PER_DEG_LAT = 111_320;

/** Keep the whole campus readable as a miniature (~14–18 units across). */
export const DEFAULT_SCENE_SCALE = 0.024;

export function createProjector(
  bbox: ShowcaseBBox,
  scale = DEFAULT_SCENE_SCALE,
): SceneProjector {
  const [centerLon, centerLat] = bbox.center;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.max(0.2, cosLat);

  const project = (lon: number, lat: number): readonly [number, number] => {
    const east = (lon - centerLon) * metersPerDegLon;
    const north = (lat - centerLat) * METERS_PER_DEG_LAT;
    return [east * scale, -north * scale];
  };

  const project3 = (
    lon: number,
    lat: number,
    y = 0,
  ): readonly [number, number, number] => {
    const [x, z] = project(lon, lat);
    return [x, y, z];
  };

  const widthM = (bbox.east - bbox.west) * metersPerDegLon;
  const depthM = (bbox.north - bbox.south) * METERS_PER_DEG_LAT;
  const span = Math.max(widthM, depthM) * scale;

  return { bbox, scale, project, project3, span };
}

export function isFeatureCollection(
  value: unknown,
): value is {
  type: "FeatureCollection";
  features: unknown[];
  bbox?: number[];
  properties?: Record<string, unknown>;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown }).features)
  );
}
