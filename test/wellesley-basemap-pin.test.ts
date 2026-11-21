import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { waysFromBasemap } from "../src/data/wellesleyBasemap.ts";

test("the bundled Wellesley basemap keeps the dataset footway and is not a barrier list", async () => {
  const basemap = JSON.parse(await readFile("data/wellesley/basemap.geojson", "utf8"));
  const ways = waysFromBasemap(basemap);
  const footway = ways.find((way) => way.id === "way/543827744");
  const library = ways.find((way) => way.name === "Clapp Library");
  assert.ok(footway);
  assert.equal(footway.kind, "road");
  assert.ok(footway.points.some((point) => point[0] === -71.3078763 && point[1] === 42.2931263));
  assert.equal(library?.kind, "building");
  assert.equal(waysFromBasemap({ features: [] }).length, 0);
});

test("the satellite pin is the dataset barrier on the bundled streets", async () => {
  const town = await readFile("src/satellite/town/SatelliteTown.tsx", "utf8");
  assert.match(town, /basemap\.geojson/);
  assert.match(town, /waysFromBasemap/);
  assert.match(town, /wellesley-barrier-campus-path-01|demoDataset\.barriers/);
  assert.match(town, /Illustrative barrier:/);
  assert.match(town, /Not a barrier inventory/);
  assert.equal(town.includes("AI-detected"), false);
});
