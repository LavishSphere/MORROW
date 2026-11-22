import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildingHeightOrFallback,
  DEFAULT_HEIGHT_METRES,
  isMicrosoftDataset,
  resolveBuildingHeight,
  withOvertureBuildings,
  type OvertureFootprint,
} from "../src/data/buildingHeight.ts";

const ring: [number, number][] = [
  [-122.4, 37.79],
  [-122.399, 37.79],
  [-122.399, 37.791],
  [-122.4, 37.79],
];

function footprint(over: Partial<OvertureFootprint>): OvertureFootprint {
  return {
    id: "b1",
    ring,
    height: null,
    numFloors: null,
    roofShape: null,
    roofHeight: null,
    minHeight: null,
    sources: [{ property: "", dataset: "OpenStreetMap", record_id: "w9@1" }],
    osmId: 9,
    ...over,
  };
}

test("Overture height is used when it is not a Microsoft imagery height", () => {
  const resolved = resolveBuildingHeight({
    overtureHeight: 260,
    sources: [
      { property: "", dataset: "OpenStreetMap", record_id: "w1@1" },
      { property: "properties/height", dataset: "OpenStreetMap" },
    ],
    osmHeight: "100",
    osmLevels: "10",
  });
  assert.deepEqual(resolved, { meters: 260, kind: "measured" });
});

test("Microsoft downtown heights are skipped for the OSM height, then levels times 3 m", () => {
  assert.equal(isMicrosoftDataset("Microsoft ML Buildings"), true);
  const fromOsm = resolveBuildingHeight({
    overtureHeight: 35,
    sources: [
      { property: "", dataset: "OpenStreetMap", record_id: "w2@1" },
      { property: "properties/height", dataset: "Microsoft ML Buildings" },
    ],
    osmHeight: "326",
    osmLevels: "61",
  });
  assert.deepEqual(fromOsm, { meters: 326, kind: "measured" });
  const fromLevels = resolveBuildingHeight({
    overtureHeight: 18,
    sources: [{ property: "", dataset: "Microsoft ML Buildings" }],
    osmLevels: "4",
    numFloors: 2,
  });
  assert.deepEqual(fromLevels, { meters: 12, kind: "levels×3" });
  assert.equal(
    resolveBuildingHeight({
      overtureHeight: 12,
      sources: [{ property: "", dataset: "Microsoft ML Buildings" }],
    }),
    null,
  );
});

test("Overture footprints replace type-based heights and only keep a recorded roof", () => {
  const geo = withOvertureBuildings(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[-122.4, 37.79], [-122.39, 37.79]] },
          properties: { layer: "road", highway: "primary", osmId: 1 },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[-122.4, 37.79], [-122.399, 37.79], [-122.399, 37.791], [-122.4, 37.79]]],
          },
          properties: { layer: "building", osmId: 9, building: "office", height: "326", "roof:shape": "pyramidal" },
        },
      ],
    },
    [
      footprint({ height: 35, sources: [{ property: "properties/height", dataset: "Microsoft ML Buildings", record_id: null }], roofShape: null }),
    ],
  ) as { features: { properties: Record<string, unknown>; geometry: { type: string } }[] };
  const road = geo.features.find((feature) => feature.properties.layer === "road");
  const building = geo.features.find((feature) => feature.properties.layer === "building");
  assert.equal(road?.geometry.type, "LineString");
  assert.equal(building?.properties.height, 326);
  assert.equal(building?.properties.height_kind, "measured");
  assert.equal(building?.properties["roof:shape"], "pyramidal");
  assert.equal(building?.properties.building, "office");
});

test("the glass city extrudes Overture footprints and does not invent a type height", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const canvas = await readFile("src/components/CanvasSlot.tsx", "utf8");
  assert.match(city, /fetchOvertureBuildings/);
  assert.match(city, /withOvertureBuildings/);
  assert.match(city, /2026-11-18\.0|OVERTURE_RELEASE/);
  assert.equal(city.includes("FLOORS[kind]"), false);
  assert.equal(city.includes("function house("), false);
  assert.match(city, /walls\(tint, ring, PODIUM_H, top\)/);
  assert.match(city, /roof:shape/);
  assert.match(canvas, /ShowcaseCanvas/);
  assert.equal(canvas.includes("SatelliteTown"), false);
});

test("a footprint with no measured height or floors still draws", () => {
  assert.deepEqual(
    buildingHeightOrFallback({
      overtureHeight: 7,
      sources: [{ property: "", dataset: "Microsoft ML Buildings" }],
    }),
    { meters: 7, kind: "estimated" },
  );
  assert.deepEqual(buildingHeightOrFallback({}), { meters: DEFAULT_HEIGHT_METRES, kind: "default" });

  const geo = withOvertureBuildings(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [ring] },
          properties: { layer: "building", osmId: 41, building: "house" },
        },
      ],
    },
    [footprint({ id: "ms1", osmId: null, sources: [{ property: "", dataset: "Microsoft ML Buildings", record_id: null }] })],
  ) as { features: { properties: Record<string, unknown> }[] };
  const buildings = geo.features.filter((feature) => feature.properties.layer === "building");
  assert.equal(buildings.length, 2, "the untagged OSM house and the Microsoft footprint are both kept");
  for (const building of buildings) {
    assert.equal(building.properties.height, DEFAULT_HEIGHT_METRES);
    assert.equal(building.properties.height_kind, "default");
  }
});
