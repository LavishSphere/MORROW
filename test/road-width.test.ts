import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { neighborhoodGeoJson, waysFromOverpass } from "../src/data/overpass.ts";
import {
  HIGHWAY_WIDTH_PRIOR_METERS,
  METERS_PER_LANE,
  resolveRoadWidth,
} from "../src/data/roadWidth.ts";

test("tagged width wins, and lanes stay on the feature", () => {
  const width = resolveRoadWidth({ highway: "primary", width: "9.5", lanes: "4" });
  assert.equal(width.widthKind, "tagged");
  assert.equal(width.widthMeters, 9.5);
  assert.equal(width.metersPerLane, null);
  assert.equal(width.lanes, 4);
  assert.equal(width.highway, "primary");
  assert.equal(width.taggedWidthMeters, 9.5);
});

test("lanes use a stated meters-per-lane assumption stored on the result", () => {
  const width = resolveRoadWidth({
    highway: "secondary",
    "lanes:forward": "2",
    "lanes:backward": "1",
  });
  assert.equal(width.widthKind, "lanes");
  assert.equal(width.lanes, 3);
  assert.equal(width.metersPerLane, METERS_PER_LANE);
  assert.equal(width.widthMeters, 3 * METERS_PER_LANE);
  assert.equal(width.taggedWidthMeters, null);
});

test("a missing width and lane count is a highway-class prior", () => {
  const residential = resolveRoadWidth({ highway: "residential" });
  const primary = resolveRoadWidth({ highway: "primary" });
  const footway = resolveRoadWidth({ highway: "footway" });
  const steps = resolveRoadWidth({ highway: "steps" });
  assert.equal(residential.widthKind, "prior");
  assert.equal(residential.metersPerLane, null);
  assert.equal(residential.widthMeters, HIGHWAY_WIDTH_PRIOR_METERS.residential);
  assert.equal(primary.widthMeters, HIGHWAY_WIDTH_PRIOR_METERS.primary);
  assert.ok(residential.widthMeters < primary.widthMeters);
  assert.ok(footway.widthMeters < residential.widthMeters);
  assert.ok(steps.widthMeters < resolveRoadWidth({ highway: "path" }).widthMeters);
});

test("a width that is not a real number falls through", () => {
  const width = resolveRoadWidth({ highway: "service", width: "narrow", lanes: "1;2" });
  assert.equal(width.widthKind, "prior");
  assert.equal(width.widthMeters, HIGHWAY_WIDTH_PRIOR_METERS.service);
  assert.equal(width.lanes, null);
});

test("the glass city ribbon uses the resolved width and keeps the label on the feature", async () => {
  const parser = await readFile("src/showcase/scene/parseBasemap.ts", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.equal(parser.includes("wayHalfWidth"), false);
  assert.match(parser, /resolveRoadWidth/);
  assert.match(parser, /width\.widthMeters \* projector\.scale/);
  assert.match(city, /way\.halfWidth/);
  const geo = neighborhoodGeoJson({
    place: { label: "Cambridge, Massachusetts", lng: -71.1, lat: 42.37 },
    note: "",
    ways: [
      {
        id: 1,
        name: "Mass Ave",
        kind: "road",
        highway: "primary",
        building: null,
        points: [
          [-71.1, 42.37],
          [-71.101, 42.371],
        ],
        lanes: 2,
        widthKind: "lanes",
        widthMeters: 2 * METERS_PER_LANE,
        metersPerLane: METERS_PER_LANE,
        taggedWidthMeters: null,
      },
    ],
  });
  const props = (geo.features[0] as { properties: Record<string, unknown> }).properties;
  assert.equal(props.highway, "primary");
  assert.equal(props.lanes, 2);
  assert.equal(props.widthKind, "lanes");
  assert.equal(props.metersPerLane, METERS_PER_LANE);
  assert.equal(props.widthMeters, 2 * METERS_PER_LANE);
});

test("Overpass keeps highway, lanes, and width on the road", () => {
  const ways = waysFromOverpass({
    elements: [
      {
        type: "way",
        id: 1,
        tags: { highway: "primary", lanes: "3", name: "Market Street" },
        geometry: [
          { lat: 37.79, lon: -122.4 },
          { lat: 37.791, lon: -122.4 },
        ],
      },
      {
        type: "way",
        id: 2,
        tags: { highway: "residential", width: "7.2" },
        geometry: [
          { lat: 37.79, lon: -122.4 },
          { lat: 37.791, lon: -122.4 },
        ],
      },
      {
        type: "way",
        id: 3,
        tags: { building: "yes" },
        geometry: [
          { lat: 37.79, lon: -122.4 },
          { lat: 37.791, lon: -122.4 },
        ],
      },
    ],
  });
  assert.equal(ways[0]?.kind, "road");
  assert.equal(ways[0]?.highway, "primary");
  assert.equal(ways[0]?.lanes, 3);
  assert.equal(ways[0]?.widthKind, "lanes");
  assert.equal(ways[0]?.metersPerLane, METERS_PER_LANE);
  assert.equal(ways[1]?.widthKind, "tagged");
  assert.equal(ways[1]?.taggedWidthMeters, 7.2);
  assert.equal(ways[1]?.widthMeters, 7.2);
  assert.equal(ways[1]?.metersPerLane, null);
  assert.equal(ways[2]?.kind, "building");
  assert.equal(ways[2]?.widthKind, null);
  assert.equal(ways[2]?.highway, null);
});

test("lanes are urban width, and a tagged width that includes sidewalks is not trusted", () => {
  const primary = resolveRoadWidth({ highway: "primary", lanes: "4" });
  assert.ok(primary.widthMeters <= 13.2);
  const wide = resolveRoadWidth({ highway: "residential", width: "18", lanes: "2" });
  assert.equal(wide.widthKind, "lanes");
  assert.ok(wide.widthMeters < 12);
  assert.equal(wide.taggedWidthMeters, 18);
  const noLanes = resolveRoadWidth({ highway: "residential", width: "25" });
  assert.equal(noLanes.widthKind, "prior");
});

test("one carriageway of a divided road is narrower than the two-way prior", () => {
  const twoWay = resolveRoadWidth({ highway: "primary" });
  const oneWay = resolveRoadWidth({ highway: "primary", oneway: "yes" });
  assert.ok(oneWay.widthMeters < twoWay.widthMeters);
});

test("tunnels, underground layers, and indoor corridors are not drawn on the ground", () => {
  const geometry = [
    { lat: 42.36, lon: -71.06 },
    { lat: 42.361, lon: -71.06 },
  ];
  const ways = waysFromOverpass({
    elements: [
      { type: "way", id: 1, tags: { highway: "motorway", tunnel: "yes", layer: "-2" }, geometry },
      { type: "way", id: 2, tags: { highway: "service", layer: "-1" }, geometry },
      { type: "way", id: 3, tags: { highway: "corridor" }, geometry },
      { type: "way", id: 4, tags: { highway: "footway", covered: "yes" }, geometry },
      { type: "way", id: 5, tags: { highway: "platform" }, geometry },
      { type: "way", id: 6, tags: { highway: "primary", tunnel: "no" }, geometry },
      { type: "way", id: 7, tags: { highway: "trunk", bridge: "yes", layer: "1", "bridge:structure": "arch" }, geometry },
    ],
  });
  assert.deepEqual(
    ways.map((way) => way.id),
    [6, 7],
  );
  assert.equal(ways[1]?.tags?.bridge, "yes");
  assert.equal(ways[1]?.tags?.["bridge:structure"], "arch");
});

test("the OSM layer tag is kept as layer:osm and never replaces the scene layer", () => {
  const ring = [
    { lat: 42.36, lon: -71.06 },
    { lat: 42.36, lon: -71.059 },
    { lat: 42.361, lon: -71.059 },
    { lat: 42.36, lon: -71.06 },
  ];
  const ways = waysFromOverpass({
    elements: [
      { type: "way", id: 10, tags: { building: "yes", layer: "1" }, geometry: ring },
      { type: "way", id: 11, tags: { highway: "primary", bridge: "yes", layer: "2" }, geometry: ring.slice(0, 2) },
      {
        type: "relation",
        id: 12,
        tags: { man_made: "bridge", type: "multipolygon", colour: "#f04a00", "bridge:structure": "suspension" },
        members: [
          { type: "way", role: "outer", geometry: ring.slice(0, 3) },
          { type: "way", role: "outer", geometry: ring.slice(2) },
        ],
      },
    ],
  });
  const geo = neighborhoodGeoJson({ place: { label: "Boston", lng: -71.06, lat: 42.36 }, note: "", ways }) as {
    features: { properties: Record<string, unknown>; geometry: { type: string } }[];
  };
  const [building, deck, outline] = geo.features;
  assert.equal(building?.properties.layer, "building");
  assert.equal(building?.properties["layer:osm"], "1");
  assert.equal(deck?.properties.layer, "road");
  assert.equal(deck?.properties["layer:osm"], "2");
  assert.equal(outline?.properties.layer, "bridge");
  assert.equal(outline?.properties.colour, "#f04a00");
  assert.equal(outline?.geometry.type, "Polygon");
});
