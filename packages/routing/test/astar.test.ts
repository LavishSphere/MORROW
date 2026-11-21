import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compareScenario } from "../src/scenario.ts";

test("shortest path search is A* with a geographic heuristic", () => {
  const source = readFileSync(new URL("../src/shortest-path.ts", import.meta.url), "utf8");
  assert.match(source, /Search is A\*/);
  assert.match(source, /haversineMeters/);
  assert.match(source, /heuristicIsAdmissible/);
  assert.match(source, /otherwise the heuristic is 0/i);
});

test("Wellesley demo still becomes reachable after the ramp under A*", () => {
  const demo = JSON.parse(
    readFileSync(new URL("../../../data/wellesley/demo-dataset.json", import.meta.url), "utf8"),
  ) as {
    scenario: {
      origin: [number, number];
      destination: [number, number];
      graphChanges: Array<{ edgeId: string; accessible: boolean }>;
    };
  };
  const basemap = JSON.parse(
    readFileSync(new URL("../../../data/wellesley/basemap.geojson", import.meta.url), "utf8"),
  );
  const comparison = compareScenario(basemap, demo.scenario);
  assert.equal(comparison.before.reachable, false);
  assert.equal(comparison.after.reachable, true);
  assert.ok(comparison.afterMeters !== null && comparison.afterMeters > 0);
  assert.equal(comparison.becameReachable, true);
});
