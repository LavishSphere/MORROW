import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { waysFromOverpass } from "../src/data/overpass.ts";
import { placeFromEsri } from "../src/data/places.ts";

test("a US place comes from the geocoder match", () => {
  const place = placeFromEsri({
    candidates: [
      {
        address: "Greenville, South Carolina",
        location: { x: -82.398964, y: 34.850746 },
      },
    ],
  });
  assert.equal(place?.label, "Greenville, South Carolina");
  assert.equal(place?.lng, -82.398964);
  assert.equal(place?.lat, 34.850746);
  assert.equal(placeFromEsri({ candidates: [] }), null);
});

test("OpenStreetMap ways are streets and buildings, not barriers", () => {
  const ways = waysFromOverpass({
    elements: [
      {
        type: "way",
        id: 12403711,
        tags: { highway: "residential", name: "South Irvine Street" },
        geometry: [
          { lat: 34.85, lon: -82.4 },
          { lat: 34.851, lon: -82.401 },
        ],
      },
      {
        type: "way",
        id: 9,
        tags: { building: "yes" },
        geometry: [
          { lat: 34.85, lon: -82.4 },
          { lat: 34.8502, lon: -82.4 },
          { lat: 34.8502, lon: -82.3998 },
        ],
      },
    ],
  });
  assert.equal(ways.length, 2);
  assert.equal(ways[0]?.kind, "road");
  assert.equal(ways[0]?.name, "South Irvine Street");
  assert.deepEqual(ways[0]?.points[0], [-82.4, 34.85]);
  assert.equal(ways[1]?.kind, "building");
});

test("the canvas is the glass city with curved roads and potholes", async () => {
  const slot = await readFile("src/components/CanvasSlot.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const town = await readFile("src/satellite/town/SatelliteTown.tsx", "utf8");
  const query = await readFile("src/data/overpass.ts", "utf8");
  assert.match(slot, /ShowcaseCanvas/);
  assert.equal(slot.includes("SatelliteTown"), false);
  assert.match(city, /function CurvedRoads/);
  assert.match(city, /function Pothole/);
  assert.match(query, /Not a barrier inventory/);
  assert.match(town, /No modeled route for this place/);
});
