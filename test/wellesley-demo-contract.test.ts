import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compareScenario } from "@morrow/routing";

type GraphChange = { edgeId: string; accessible: boolean; weight?: number };

type DemoFile = {
  scenario: {
    id: string;
    origin: [number, number];
    destination: [number, number];
    barrierId: string;
    interventionId: string;
    graphChanges: GraphChange[];
  };
  interventions: Array<{
    id: string;
    barrierId: string;
    graphChanges: GraphChange[];
  }>;
};

const TARGET_WAYS = ["osm-way-543827744", "osm-way-543827745"] as const;

function loadDemo(): DemoFile {
  return JSON.parse(
    readFileSync("data/wellesley/demo-dataset.json", "utf8"),
  ) as DemoFile;
}

function loadBasemap(): unknown {
  return JSON.parse(
    readFileSync("data/wellesley/basemap.geojson", "utf8"),
  );
}

test("demo scenario graphChanges match the bundled ramp intervention", () => {
  const demo = loadDemo();
  const intervention = demo.interventions.find(
    (item) => item.id === demo.scenario.interventionId,
  );
  assert.ok(intervention);
  assert.equal(demo.scenario.id, "wellesley-demo-01");
  assert.equal(demo.scenario.interventionId, "wellesley-intervention-ramp-01");
  assert.equal(intervention.barrierId, demo.scenario.barrierId);
  assert.deepEqual(demo.scenario.graphChanges, intervention.graphChanges);
  assert.deepEqual(
    demo.scenario.graphChanges.map((change) => change.edgeId),
    [...TARGET_WAYS],
  );
});

test("compareScenario on wellesley-demo-01 returns modeled meters, not constants", () => {
  const demo = loadDemo();
  const comparison = compareScenario(loadBasemap(), demo.scenario);
  assert.equal(comparison.before.reachable, false);
  assert.equal(comparison.beforeMeters, null);
  assert.equal(comparison.after.reachable, true);
  assert.ok(comparison.afterMeters !== null && comparison.afterMeters > 0);
  assert.notEqual(comparison.afterMeters, 1200);
  assert.notEqual(comparison.afterMeters, 800);
  assert.equal(comparison.becameReachable, true);
});

test("Vite still inlines GeoJSON so Pages cannot emit a basemap URL", async () => {
  const { readFile } = await import("node:fs/promises");
  const vite = await readFile("vite.config.ts", "utf8");
  assert.match(vite, /geojson-as-json/);
  assert.equal(vite.includes("assetsInclude:"), false);
});

test("client compare and API facts both pass intervention graphChanges to compareScenario", () => {
  const client = readFileSync("src/data/compare.ts", "utf8");
  const api = readFileSync("packages/api/src/facts.ts", "utf8");
  assert.match(client, /graphChanges:\s*intervention\.graphChanges/);
  assert.match(api, /graphChangesForIntervention\(intervention\.id\)/);
  assert.equal(client.includes("graphChanges: scenario.graphChanges"), false);
  assert.equal(api.includes("graphChanges: scenario.graphChanges"), false);
});

test("scripts typecheck allows .ts imports so tests can load @morrow/routing", () => {
  const scripts = readFileSync("tsconfig.scripts.json", "utf8");
  assert.match(scripts, /"allowImportingTsExtensions":\s*true/);
  assert.match(scripts, /test\/\*\*\/\*\.ts/);
});

test("client and API reject empty intervention graphChanges", () => {
  const client = readFileSync("src/data/compare.ts", "utf8");
  const api = readFileSync("packages/api/src/facts.ts", "utf8");
  assert.match(client, /graphChanges\.length === 0/);
  assert.match(api, /graphChanges\.length === 0/);
});
