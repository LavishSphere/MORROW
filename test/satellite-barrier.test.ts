import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("satellite falls back to the illustrative Wellesley barrier", async () => {
  const town = await readFile("src/satellite/town/SatelliteTown.tsx", "utf8");
  const dataset = JSON.parse(
    await readFile("data/wellesley/demo-dataset.json", "utf8"),
  ) as { barriers: Array<{ id: string }> };
  assert.match(town, /demo-dataset\.json/);
  assert.match(town, /Illustrative Wellesley scenario, not an AI detection/);
  assert.match(town, /satellite-town__caption/);
  assert.match(town, /typeof pinsModule\?\.useAiDetection !== 'function'/);
  assert.equal(dataset.barriers[0]?.id, "wellesley-barrier-campus-path-01");
  assert.equal(town.includes("Problems detected by AI"), false);
  assert.equal(town.includes("STUB_COST_USD"), false);
  assert.equal(town.includes("4800"), false);
  assert.match(town, /compareByIds/);
  assert.match(town, /satellite-town__meters/);
  assert.match(town, /Not a Gemini estimate/);
});
