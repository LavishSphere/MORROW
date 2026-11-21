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

test("client fixtures lock scenario graphChanges to the linked intervention", async () => {
  const fixtures = await readFile("src/data/fixtures.ts", "utf8");
  assert.equal(fixtures.includes("assertLinkedGraphChanges"), true);
  assert.equal(
    fixtures.includes(
      "scenario.graphChanges must deep-equal the linked intervention.graphChanges",
    ),
    true,
  );
});

test("compareByIds rejects a missing scenario id", async () => {
  const compare = await readFile("src/data/compare.ts", "utf8");
  assert.match(compare, /!input\.scenarioId \|\| input\.scenarioId !== scenario\.id/);
});
