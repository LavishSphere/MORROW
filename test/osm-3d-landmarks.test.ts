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
  const loader = await readFile("src/data/overpass.ts", "utf8");
  assert.match(loader, /way\["building:part"\]/);
  assert.match(city, /function drawPiece\(/);
  assert.match(city, /shape === "skillion"/);
  assert.match(city, /shape === "dome"/);
  // Incomplete downloads fall back to the whole building at its real height.
  assert.match(city, /const complete = piecesTop >= ownTop \* 0\.9;/);
  assert.match(city, /The mapper recorded its real height: use it, not a guess\./);
});
