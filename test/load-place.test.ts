import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { neighborhoodGeoJson, waysFromOverpass } from "../src/data/overpass.ts";
import { placeFromEsri, suggestionsFromEsri } from "../src/data/places.ts";

test("typed text lists every matching US city the geocoder suggests", () => {
  const list = suggestionsFromEsri({
    suggestions: [
      { text: "Greenville, SC, USA", magicKey: "a", isCollection: false },
      { text: "Greenville, NC, USA", magicKey: "b", isCollection: false },
      { text: "Green Bay, WI, USA", magicKey: "c", isCollection: false },
      { text: "Coffee shops", magicKey: "d", isCollection: true },
      { text: "", magicKey: "e" },
      { text: "No key, USA" },
    ],
  });
  assert.deepEqual(
    list.map((s) => s.label),
    ["Greenville, SC, USA", "Greenville, NC, USA", "Green Bay, WI, USA"],
  );
  assert.equal(list[0]?.magicKey, "a");
  assert.deepEqual(suggestionsFromEsri({}), []);
  assert.deepEqual(suggestionsFromEsri(null), []);
});

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
  const wet = waysFromOverpass({
    elements: [
      {
        type: "way",
        id: 42,
        tags: { natural: "water", name: "Lake Waban", water: "lake" },
        geometry: [
          { lat: 42.29, lon: -71.31 },
          { lat: 42.291, lon: -71.309 },
          { lat: 42.29, lon: -71.308 },
          { lat: 42.29, lon: -71.31 },
        ],
      },
      {
        type: "way",
        id: 43,
        tags: { waterway: "stream", name: "Fuller Brook" },
        geometry: [
          { lat: 42.29, lon: -71.31 },
          { lat: 42.292, lon: -71.309 },
        ],
      },
      {
        type: "way",
        id: 44,
        tags: { highway: "residential", natural: "water" },
        geometry: [
          { lat: 42.29, lon: -71.31 },
          { lat: 42.291, lon: -71.31 },
        ],
      },
    ],
  });
  assert.equal(wet[0]?.kind, "water");
  assert.equal(wet[1]?.kind, "waterway");
  assert.equal(wet[2]?.kind, "road");
  const geo = neighborhoodGeoJson({
    place: { label: "Wellesley, Massachusetts", lng: -71.3, lat: 42.29 },
    note: "",
    ways: wet,
  });
  const layers = (geo.features as { properties: { layer: string } }[]).map((f) => f.properties.layer);
  assert.deepEqual(layers, ["water", "waterway", "road"]);
});

test("the canvas loads a typed place on the satellite scene", async () => {
  const slot = await readFile("src/components/CanvasSlot.tsx", "utf8");
  const town = await readFile("src/satellite/town/SatelliteTown.tsx", "utf8");
  const query = await readFile("src/data/overpass.ts", "utf8");
  assert.match(slot, /ShowcaseCanvas/);
  assert.equal(slot.includes("SatelliteTown"), false);
  assert.match(query, /Not a barrier inventory/);
  assert.match(town, /No modeled route for this place/);
});

test("a loaded city becomes a basemap the glass city can rebuild from", async () => {
  const geo = neighborhoodGeoJson({
    place: { label: "Cambridge, Massachusetts", lng: -71.1, lat: 42.37 },
    note: "",
    ways: [
      { id: 1, name: "Main Street", kind: "road", highway: "primary", building: null, points: [[-71.1, 42.37], [-71.101, 42.371]] },
      { id: 2, name: null, kind: "road", highway: "footway", building: null, points: [[-71.1, 42.37], [-71.1, 42.371]] },
      { id: 3, name: "Hall", kind: "building", highway: null, building: "college", points: [[-71.1, 42.37], [-71.1, 42.3702], [-71.0998, 42.3702]] },
    ],
  });
  assert.equal(geo.type, "FeatureCollection");
  const [road, foot, hall] = geo.features as {
    geometry: { type: string; coordinates: number[][][] };
    properties: Record<string, unknown>;
  }[];
  assert.equal(road?.properties.layer, "road");
  assert.equal(foot?.properties.layer, "footway");
  assert.equal(hall?.geometry.type, "Polygon");
  assert.equal(hall?.properties.building, "college");
  const ring = hall?.geometry.coordinates[0] ?? [];
  assert.deepEqual(ring[0], ring[ring.length - 1]);

  // The canvas hands the loaded map to the 3D city.
  const slot = await readFile("src/components/CanvasSlot.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(slot, /neighborhoodGeoJson\(neighborhood\)/);
  assert.match(slot, /geoJson=\{geoJson\}/);
  assert.match(city, /export function City\(\{ geoJson, reducedMotion = false \}/);
});
