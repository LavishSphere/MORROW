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
  assert.equal(city.includes("CircuitGrid"), false);
  assert.match(city, /Sparkles/);
  assert.match(city, /#0a3842/);
  assert.match(city, /crystal/);
  assert.equal(city.includes("DetailedBuilding"), false);
  assert.equal(canvas.includes("OpeningSequence"), false);
  assert.match(sky, /0.62, 0.90, 0.95/);
});
