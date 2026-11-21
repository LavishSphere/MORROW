import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("client API_STATUS is the shipped outage path", async () => {
  const text = await readFile("src/data/api.ts", "utf8");
  assert.match(text, /barriersApi:\s*false/);
  assert.match(text, /generateApi:\s*false/);
  assert.match(text, /gemini:\s*false/);
  assert.match(text, /tigerData:\s*false/);
  assert.match(text, /morrowRouting:\s*true/);
  assert.equal(
    text.includes("Generate API unavailable — using local template draft."),
    true,
  );
  assert.equal(
    text.includes("Gemini unavailable — template prose only."),
    true,
  );
  assert.match(text, /liveApiReachable === true/);
  assert.equal(text.includes("idsMatchDemo"), true);
});

test("Compare entry stays on compareScenario with ids only", async () => {
  const text = await readFile("src/data/compare.ts", "utf8");
  assert.equal(
    text.includes("import { compareScenario } from '@morrow/routing'"),
    true,
  );
  assert.equal(text.includes("compareScenario(basemap,"), true);
  assert.equal(text.includes("ids only"), true);
});

test("template draft stays modeled when Gemini is down", async () => {
  const text = await readFile("src/data/templateProposal.ts", "utf8");
  assert.equal(text.includes("Results are modeled only."), true);
  assert.equal(text.includes("Gemini is unavailable"), true);
});
