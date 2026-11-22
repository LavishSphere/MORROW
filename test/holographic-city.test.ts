import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the glass city is rebuilt from the real Wellesley map", async () => {
  const town = await readFile("src/showcase/scene/TownScene.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const canvas = await readFile("src/showcase/ShowcaseCanvas.tsx", "utf8");
  const sky = await readFile("src/showcase/scene/Space.tsx", "utf8");
  assert.match(town, /<City geoJson=\{geoJson\} \/>/);
  assert.match(city, /HoloBuilding/);
  // Real town data: every building and street comes from the OSM extract.
  assert.match(city, /data\/wellesley\/basemap\.geojson/);
  assert.match(city, /parseBasemap\(geoJson, projector\)/);
  assert.match(city, /const WELLESLEY = buildModel\(basemap\)/);
  assert.match(city, /model\.parsed\.buildings\.map/);
  assert.match(city, /way\.name === "Central Street"/);
  // Every side is glazed: the curtain-wall glass wraps each extruded footprint.
  const glass = await readFile("src/showcase/scene/glass.ts", "utf8");
  assert.match(city, /worldCurtainWall\(/);
  assert.match(city, /material=\{\[roof, glass\]\}/);
  assert.match(glass, /Mullions and floor slabs/);
  assert.match(city, /MeshPhysicalMaterial/);
  assert.equal(city.includes("<Edges"), false);
  assert.match(city, /function Roads/);
  assert.match(city, /function Pothole/);
  assert.match(city, /function Hydrant/);
  assert.match(city, /function Lamp/);
  assert.match(city, /function Bench/);
  assert.match(city, /function Trees/);
  assert.equal(city.includes("CircuitGrid"), false);
  assert.match(city, /Sparkles/);
  assert.equal(city.includes("DetailedBuilding"), false);
  assert.equal(canvas.includes("OpeningSequence"), false);
  // Realistic daylight sky: blue zenith, sun glow, drifting clouds.
  assert.match(sky, /vec3 zenith/);
  assert.match(sky, /fbm\(/);
  assert.match(sky, /uSun/);
});
