import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("client generate path guards demo scenario ids", async () => {
  const text = await readFile("src/data/api.ts", "utf8");
  assert.equal(text.includes("idsMatchDemoScenario"), true);
  assert.equal(text.includes("intervention.barrierId"), true);
  assert.equal(text.includes("SCENARIO.interventionId"), true);
  assert.match(text, /function idsMatchDemoScenario/);
  assert.match(text, /intervention\.barrierId === barrier\.id/);
  assert.match(text, /SCENARIO\.interventionId === intervention\.id/);
});
