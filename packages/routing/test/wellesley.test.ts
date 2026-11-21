import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compareIntervention, MODELED_IMPACT_ASSUMPTIONS } from "../src/compare.ts";
import { edgeBelongsToWay, wayIdFromEdgeId } from "../src/from-geojson.ts";
import {
  compareScenario,
  expandWayGraphChanges,
  scenarioQuery,
  walkableGraphForScenario,
} from "../src/scenario.ts";
import type { GraphChange, PedestrianGraph } from "../src/types.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const TARGET_WAYS = ["osm-way-543827744", "osm-way-543827745"] as const;

type DemoFile = {
  scenario: {
    id: string;
    origin: [number, number];
    destination: [number, number];
    graphChanges: GraphChange[];
  };
};

function loadBasemap(): unknown {
  return JSON.parse(
    readFileSync(join(repoRoot, "data/wellesley/basemap.geojson"), "utf8"),
  );
}

function loadDemo(): DemoFile {
  return JSON.parse(
    readFileSync(join(repoRoot, "data/wellesley/demo-dataset.json"), "utf8"),
  ) as DemoFile;
}

function sumPathMeters(graph: PedestrianGraph, edgeIds: string[]): number {
  const lengthById = new Map(graph.edges.map((edge) => [edge.id, edge.lengthMeters]));
  let total = 0;
  for (const id of edgeIds) {
    const length = lengthById.get(id);
    assert.ok(typeof length === "number", `missing length for ${id}`);
    total += length;
  }
  return total;
}

test("wellesley-demo-01 graph contains the intervention way ids", () => {
  const demo = loadDemo();
  const graph = walkableGraphForScenario(loadBasemap(), demo.scenario.graphChanges);
  const wayIds = new Set(graph.edges.map((edge) => wayIdFromEdgeId(edge.id)));
  for (const wayId of TARGET_WAYS) {
    assert.equal(wayIds.has(wayId), true, `missing ${wayId}`);
    assert.equal(
      demo.scenario.graphChanges.some((change) => change.edgeId === wayId),
      true,
    );
  }
  assert.equal(
    graph.edges
      .filter((edge) => TARGET_WAYS.some((wayId) => edgeBelongsToWay(edge.id, wayId)))
      .every((edge) => edge.accessible === false),
    true,
  );
});

test("compareIntervention on wellesley-demo-01 recomputes meters from those ways", () => {
  const demo = loadDemo();
  assert.equal(demo.scenario.id, "wellesley-demo-01");
  const collection = loadBasemap();
  const graph = walkableGraphForScenario(collection, demo.scenario.graphChanges);
  const query = scenarioQuery(graph, demo.scenario.origin, demo.scenario.destination);
  const changes = expandWayGraphChanges(graph, demo.scenario.graphChanges);
  const comparison = compareIntervention(graph, query, changes);

  assert.equal(comparison.becameReachable, true);
  assert.equal(comparison.before.reachable, false);
  assert.equal(comparison.beforeMeters, null);
  assert.equal(comparison.after.reachable, true);
  assert.ok(comparison.afterMeters !== null && comparison.afterMeters > 0);
  assert.equal(
    comparison.afterMeters,
    sumPathMeters(graph, comparison.after.edgeIds),
  );
  assert.deepEqual(comparison.assumptions, [...MODELED_IMPACT_ASSUMPTIONS]);

  const afterWays = new Set(comparison.after.edgeIds.map(wayIdFromEdgeId));
  for (const wayId of TARGET_WAYS) {
    assert.equal(afterWays.has(wayId), true, `after path skipped ${wayId}`);
  }

  const viaHelper = compareScenario(collection, demo.scenario);
  assert.equal(viaHelper.afterMeters, comparison.afterMeters);
  assert.deepEqual(viaHelper.after.edgeIds, comparison.after.edgeIds);
});

test("scaling osm-way-543827744 and osm-way-543827745 changes after meters", () => {
  const demo = loadDemo();
  const graph = walkableGraphForScenario(loadBasemap(), demo.scenario.graphChanges);
  const query = scenarioQuery(graph, demo.scenario.origin, demo.scenario.destination);
  const changes = expandWayGraphChanges(graph, demo.scenario.graphChanges);
  const baseline = compareIntervention(graph, query, changes);
  assert.ok(baseline.afterMeters !== null);

  const extra = 17;
  const pathIds = new Set(baseline.after.edgeIds);
  const scaled: PedestrianGraph = {
    nodes: graph.nodes,
    edges: graph.edges.map((edge) => {
      if (
        !pathIds.has(edge.id) ||
        !TARGET_WAYS.some((wayId) => edgeBelongsToWay(edge.id, wayId))
      ) {
        return edge;
      }
      return {
        ...edge,
        lengthMeters: edge.lengthMeters + extra,
        weight: edge.weight ?? edge.lengthMeters,
      };
    }),
  };

  const perturbed = compareIntervention(scaled, query, changes);
  assert.deepEqual(perturbed.after.edgeIds, baseline.after.edgeIds);
  assert.ok(perturbed.afterMeters !== null);
  assert.equal(perturbed.afterMeters, sumPathMeters(scaled, perturbed.after.edgeIds));
  const hopsOnPath = baseline.after.edgeIds.filter((id) =>
    TARGET_WAYS.some((wayId) => edgeBelongsToWay(id, wayId)),
  ).length;
  assert.ok(hopsOnPath > 0);
  assert.equal(perturbed.afterMeters, baseline.afterMeters + extra * hopsOnPath);
  assert.notEqual(perturbed.afterMeters, baseline.afterMeters);
});
