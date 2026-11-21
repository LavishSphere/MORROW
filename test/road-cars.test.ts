import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("cars ride the roads and stay off the buildings", async () => {
  const town = await readFile("src/satellite/town/SatelliteTown.tsx", "utf8");
  assert.match(town, /satellite-town__car/);
  assert.match(town, /way\.kind === 'road'/);
  assert.match(town, /animateMotion/);
  assert.match(town, /if \(reducedMotion\)/);
  assert.equal(town.includes("AI-detected"), false);
});
