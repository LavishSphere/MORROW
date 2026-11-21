import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { compareScenario } from "@morrow/routing";

test("README runbook says how to open the demo and what fallbacks do", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.match(readme, /https:\/\/lavishsphere\.github\.io\/MORROW\//);
  assert.match(readme, /No login/);
  assert.match(readme, /npm run dev/);
  assert.match(readme, /What the fallbacks do/);
  assert.match(readme, /List \(2D\)/);
  assert.match(readme, /compareScenario/);
  assert.match(readme, /wellesley-demo-01/);
  assert.match(readme, /wellesley-intervention-ramp-01/);
});

test("client API_STATUS is the shipped outage path", async () => {
  const text = await readFile("src/data/api.ts", "utf8");
  assert.match(text, /barriersApi:\s*false/);
  assert.match(text, /generateApi:\s*false/);
  assert.match(text, /gemini:\s*false/);
  assert.match(text, /tigerData:\s*false/);
  assert.match(text, /morrowRouting:\s*true/);
  assert.match(
    text,
    /Bundled Wellesley fixtures — live barrier API unavailable/,
  );
  assert.match(text, /Generate API unavailable — using local template draft/);
  assert.match(text, /Gemini unavailable — template prose only/);
});

test("bundled Wellesley compare stays modeled, not constants", async () => {
  const [basemap, demo] = await Promise.all([
    readFile("data/wellesley/basemap.geojson", "utf8").then((text) =>
      JSON.parse(text) as unknown,
    ),
    readFile("data/wellesley/demo-dataset.json", "utf8").then(
      (text) =>
        JSON.parse(text) as {
          scenario: {
            origin: [number, number];
            destination: [number, number];
            graphChanges: Array<{
              edgeId: string;
              accessible: boolean;
              weight?: number;
            }>;
          };
        },
    ),
  ]);

  const comparison = compareScenario(basemap, demo.scenario);
  assert.equal(comparison.before.reachable, false);
  assert.equal(comparison.beforeMeters, null);
  assert.equal(comparison.after.reachable, true);
  assert.ok(comparison.afterMeters !== null && comparison.afterMeters > 0);
  assert.notEqual(comparison.afterMeters, 0);
});
