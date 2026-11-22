import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { neighborhoodGeoJson, waysFromOverpass } from "../src/data/overpass.ts";

test("3D building pieces and their real shape tags survive loading", () => {
  const ways = waysFromOverpass({
    elements: [
      {
        type: "way",
        id: 1,
        tags: { building: "office", name: "Tower", height: "443.2", "building:colour": "beige" },
        geometry: [
          { lat: 40.748, lon: -73.986 },
          { lat: 40.749, lon: -73.986 },
          { lat: 40.749, lon: -73.985 },
          { lat: 40.748, lon: -73.986 },
        ],
      },
      {
        type: "way",
        id: 2,
        tags: { "building:part": "yes", height: "330", min_height: "320", "roof:shape": "pyramidal" },
        geometry: [
          { lat: 40.7484, lon: -73.9858 },
          { lat: 40.7485, lon: -73.9858 },
          { lat: 40.7485, lon: -73.9857 },
          { lat: 40.7484, lon: -73.9858 },
        ],
      },
    ],
  });
  assert.equal(ways.find((w) => w.id === 1)?.kind, "building");
  assert.equal(ways.find((w) => w.id === 2)?.kind, "part");
  assert.equal(ways.find((w) => w.id === 2)?.tags?.["roof:shape"], "pyramidal");
  const geo = neighborhoodGeoJson({ place: { label: "NYC", lng: -73.986, lat: 40.748 }, note: "", ways }) as {
    features: { properties: Record<string, unknown> }[];
  };
  const layers = geo.features.map((f) => f.properties.layer);
  assert.ok(layers.includes("building_part"));
  assert.equal(geo.features.find((f) => f.properties.layer === "building")?.properties.height, "443.2");
});

test("landmarks are drawn from their real heights, roof shapes, and colors", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const loader = (await readFile("src/data/overpass.ts", "utf8")) + (await readFile("shared/osmQueries.ts", "utf8"));
  assert.match(loader, /way\["building:part"\]/);
  assert.match(city, /function drawPiece\(/);
  assert.match(city, /shape === "skillion"/);
  assert.match(city, /shape === "dome"/);
  // Incomplete downloads fall back to the whole building at its real height.
  assert.match(city, /const complete = piecesTop >= ownTop \* 0\.9;/);
  assert.match(city, /The mapper recorded its real height and look: use them, not a guess\./);
});

// Two of the four pillars of SF City Hall's relation 7261822 (live OSM data).
// The second pillar's member way is split in two here, one half reversed,
// to exercise stitching. Member ways carry no tags, as in OSM.
const pt = (lat: number, lon: number) => ({ lat, lon });
const cityHallFloor = {
  type: "relation",
  id: 7261822,
  tags: { "building:part": "yes", "building:colour": "#e3e3de", height: "15", type: "multipolygon" },
  members: [
    {
      type: "way",
      role: "outer",
      geometry: [
        pt(37.7792481, -122.4197878),
        pt(37.7792767, -122.4197938),
        pt(37.7792734, -122.4198191),
        pt(37.7792447, -122.4198131),
        pt(37.7792481, -122.4197878),
      ],
    },
    {
      type: "way",
      role: "outer",
      geometry: [pt(37.7791651, -122.4197701), pt(37.7791617, -122.4197967), pt(37.7791273, -122.4197895)],
    },
    {
      type: "way",
      role: "outer",
      geometry: [pt(37.7791651, -122.4197701), pt(37.779149, -122.4197668), pt(37.7791308, -122.419763), pt(37.7791273, -122.4197895)],
    },
  ],
};

const cityHallOutline = {
  type: "relation",
  id: 7261820,
  tags: { building: "public", name: "San Francisco City Hall", height: "30", type: "multipolygon" },
  members: [
    { type: "way", role: "outer", geometry: [pt(37.7788, -122.42), pt(37.7796, -122.42), pt(37.7796, -122.4185)] },
    { type: "way", role: "outer", geometry: [pt(37.7796, -122.4185), pt(37.7788, -122.4185), pt(37.7788, -122.42)] },
    {
      type: "way",
      role: "inner",
      geometry: [pt(37.779, -122.4195), pt(37.7792, -122.4195), pt(37.7792, -122.419), pt(37.779, -122.4195)],
    },
  ],
};

test("buildings and parts mapped as relations load as closed, tagged shapes", () => {
  const ways = waysFromOverpass({ elements: [cityHallFloor, cityHallOutline] });
  const parts = ways.filter((w) => w.id === 7261822);
  assert.equal(parts.length, 2, "one shape per outer ring");
  for (const part of parts) {
    assert.equal(part.kind, "part");
    assert.equal(part.osmType, "relation");
    assert.equal(part.tags?.height, "15");
    assert.equal(part.tags?.["building:colour"], "#e3e3de");
    assert.deepEqual(part.points[0], part.points[part.points.length - 1], "ring is closed");
  }
  assert.ok(parts.some((part) => part.points.length === 6), "the split pillar is stitched into one ring");
  const building = ways.filter((w) => w.id === 7261820);
  assert.equal(building.length, 1, "the inner courtyard is not drawn as its own building");
  assert.equal(building[0]?.kind, "building");
  assert.equal(building[0]?.building, "public");
  assert.equal(building[0]?.name, "San Francisco City Hall");
  assert.equal(building[0]?.points.length, 5, "two halves stitched into one closed rectangle");

  // A relation tagged both building and building:part is a part, as for ways.
  const both = waysFromOverpass({
    elements: [{ ...cityHallOutline, tags: { ...cityHallOutline.tags, "building:part": "yes" } }],
  });
  assert.equal(both[0]?.kind, "part");

  // Relation ids are kept apart from way ids of the same number.
  const geo = neighborhoodGeoJson({ place: { label: "SF", lng: -122.419, lat: 37.779 }, note: "", ways }) as {
    features: { properties: Record<string, unknown> }[];
  };
  assert.equal(geo.features.find((f) => f.properties.layer === "building")?.properties.osmId, "r7261820");
  const partFeatures = geo.features.filter((f) => f.properties.layer === "building_part");
  assert.equal(partFeatures.length, 2);
  assert.equal(partFeatures[0]?.properties.osmId, "r7261822");
});

test("the area download asks for building relations and keeps relation water", async () => {
  const loader = (await readFile("src/data/overpass.ts", "utf8")) + (await readFile("shared/osmQueries.ts", "utf8"));
  assert.match(loader, /relation\["building:part"\]\(\$\{b\}\);out tags geom \d+;/);
  assert.match(loader, /relation\["building"\]\(\$\{b\}\);out tags geom \d+;/);
  assert.match(loader, /relation\["natural"="water"\]/);
});

test("landmark pieces never float: no inherited bottom, and a base under lifted pieces", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  // A part without min_height starts at the ground, not at the outline's min_height.
  assert.match(city, /delete base\.min_height;/);
  assert.match(city, /delete base\["building:min_level"\];/);
  assert.match(city, /\{ \.\.\.base, \.\.\.piece\.tags \}/);
  assert.equal(city.includes("{ ...own, ...piece.tags }"), false);
  // Only upper pieces present: the outline is drawn from the ground up to them.
  assert.match(city, /lowest > GROUND_SLACK_M/);
  assert.match(city, /walls\(surface\(own, building\.id\), ring, 0, y\)/);
  // Unowned pieces off the ground wait for something to stand on.
  assert.match(city, /grounded\.some\(\(under\) => insideRing\(px, pz, under\.ring\)\)/);
});
