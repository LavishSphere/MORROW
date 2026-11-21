import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the unused holographic city still builds from glass blocks", async () => {
  const town = await readFile("src/showcase/scene/TownScene.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const canvas = await readFile("src/showcase/ShowcaseCanvas.tsx", "utf8");
  const sky = await readFile("src/showcase/scene/Space.tsx", "utf8");
  assert.match(town, /<City \/>/);
  assert.match(city, /HoloBuilding/);
  assert.match(city, /function Roads/);
  assert.match(city, /function CurvedRoads/);
  assert.match(city, /function Pothole/);
  assert.match(city, /function Hydrant/);
  assert.match(city, /function Lamp/);
  assert.match(city, /function Bench/);
  assert.equal(city.includes("CircuitGrid"), false);
  assert.match(city, /Sparkles/);
  assert.match(city, /#0a3842/);
  assert.match(city, /crystal/);
  assert.equal(city.includes("DetailedBuilding"), false);
  assert.equal(canvas.includes("OpeningSequence"), false);
  // Realistic daylight sky: blue zenith, sun glow, drifting clouds.
  assert.match(sky, /vec3 zenith/);
  assert.match(sky, /fbm\(/);
  assert.match(sky, /uSun/);
});
