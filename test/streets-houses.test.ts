import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { neighborhoodGeoJson, tileKey, waysFromOverpass } from "../src/data/overpass.ts";

test("loaded cities use their real OpenStreetMap streets, with a labeled stand-in only as a fallback", async () => {
  const loader = await readFile("src/data/overpass.ts", "utf8");
  // Real streets first.
  assert.match(loader, /const ways = await fetchArea\(place\.lng, place\.lat\)/);
  // The procedural grid only when OpenStreetMap cannot be reached, and it says so.
  assert.match(loader, /procedural: true/);
  assert.match(loader, /OpenStreetMap could not be reached, so this is a procedural stand-in/);
});

test("accessibility tags survive loading, so other cities get issues too", () => {
  const ways = waysFromOverpass({
    elements: [
      {
        type: "way",
        id: 7,
        tags: { highway: "footway", footway: "crossing", crossing: "unmarked", name: "x" },
        geometry: [
          { lat: 42.1, lon: -71.1 },
          { lat: 42.1001, lon: -71.1 },
        ],
      },
    ],
  });
  assert.deepEqual(ways[0]?.tags, { footway: "crossing", crossing: "unmarked" });
  const geo = neighborhoodGeoJson({
    place: { label: "Somewhere", lng: -71.1, lat: 42.1 },
    note: "",
    ways,
  }) as { center: number[]; features: { properties: Record<string, unknown> }[] };
  assert.equal(geo.features[0]?.properties.crossing, "unmarked");
  // A fixed center keeps the scene still as more areas load.
  assert.deepEqual(geo.center, [-71.1, 42.1]);
});

test("nearby points share one download area", () => {
  assert.equal(tileKey(-71.1, 42.1), tileKey(-71.1001, 42.1001));
  assert.notEqual(tileKey(-71.1, 42.1), tileKey(-71.08, 42.1));
});

test("walking near the edge of a loaded city loads the real area ahead", async () => {
  const hook = await readFile("src/data/useCityStreaming.ts", "utf8");
  const slot = await readFile("src/components/CanvasSlot.tsx", "utf8");
  const loader = await readFile("src/data/overpass.ts", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const store = await readFile("src/showcase/issueStore.ts", "utf8");
  assert.match(slot, /useCityStreaming\(neighborhood, onNeighborhood\)/);
  assert.match(hook, /neighborhood\.procedural/);
  assert.match(hook, /map\.unproject\(/);
  assert.match(hook, /failed\.current\.add\(key\)/);
  // New areas join without duplicating ways already loaded.
  assert.match(loader, /fresh\.filter\(\(way\) => !seen\.has\(way\.id\)\)/);
  // The city keeps the loaded place's center.
  assert.match(city, /A loaded city keeps one fixed center/);
  // Fixes and picks carry over when more of the same city loads.
  assert.match(store, /const keep = \(set: ReadonlySet<string>\)/);
});

test("suburban homes are houses with gable roofs, not glass towers", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(city, /const HOUSE_KINDS = new Set\(\["house", "detached", "semidetached_house"/);
  assert.match(city, /if \(HOUSE_KINDS\.has\(kind\) \|\| \(kind === "yes" && Math\.abs\(signedArea\(ring\)\) < SMALL_UNTYPED\)\)/);
  // Small untyped buildings (under about 250 m²) are usually homes.
  assert.match(city, /const SMALL_UNTYPED = 250 \* 0\.14 \* 0\.14;/);
  assert.match(city, /function house\(/);
  // Ridge along the longest wall, gable ends in siding, some chimneys.
  assert.match(city, /Orient a box to the longest wall/);
  assert.match(city, /Gable ends in the siding color/);
  assert.match(city, /houses\.shingles\[i\]/);
});
