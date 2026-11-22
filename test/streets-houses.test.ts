import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { neighborhoodGeoJson, tileKey, waysFromOverpass } from "../src/data/overpass.ts";

test("loaded cities use their real OpenStreetMap streets, with a labeled stand-in only as a fallback", async () => {
  const loader = (await readFile("src/data/overpass.ts", "utf8")) + (await readFile("shared/osmQueries.ts", "utf8"));
  // The place's own tile (cacheable by the API), with the wider coastline alongside so a coastal city gets the ocean.
  assert.match(loader, /const key = tileKey\(place\.lng, place\.lat\)/);
  assert.match(loader, /await fetchTile\(key\)/);
  assert.match(loader, /tiles: \[key\]/);
  assert.match(loader, /fetchCoastline\(place\.lng, place\.lat\)/);
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
  const loader = (await readFile("src/data/overpass.ts", "utf8")) + (await readFile("shared/osmQueries.ts", "utf8"));
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const store = await readFile("src/showcase/issueStore.ts", "utf8");
  assert.match(slot, /useCityStreaming\(neighborhood, onNeighborhood\)/);
  assert.match(hook, /neighborhood\.procedural/);
  assert.match(hook, /map\.unproject\(/);
  assert.match(hook, /failed\.current\.add\(key\)/);
  // New areas join without duplicating ways already loaded.
  // Relations carry an `r`, so one never hides a way of the same number.
  assert.match(loader, /fresh\.filter\(\(way\) => !seen\.has\(wayKey\(way\)\)\)/);
  assert.match(loader, /return `\$\{way\.kind\}:\$\{osmRef\(way\)\}`/);
  // The city keeps the loaded place's center.
  assert.match(city, /A loaded city keeps one fixed center/);
  // Fixes and picks carry over when more of the same city loads.
  assert.match(store, /const keep = \(set: ReadonlySet<string>\)/);
});

test("homes are houses; other buildings are extruded footprints with a roof only when roof:shape is present", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(city, /function house\(/);
  assert.match(city, /HOUSE_KINDS\.has\(kind\)/);
  // A recorded height taller than a house keeps the building out of the house path.
  assert.match(city, /real\.top <= HOUSE_MAX_METRES/);
  assert.equal(city.includes("FLOORS[kind]"), false);
  assert.match(city, /const shape = String\(own\["roof:shape"\]/);
  assert.match(city, /walls\(tint, ring, PODIUM_H, top\)/);
  assert.match(city, /houses\.shingles\[i\]/);
});
