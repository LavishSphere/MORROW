import assert from "node:assert/strict";
import { test } from "node:test";
import { applyGraphChanges } from "../src/apply-changes.ts";
import {
  compareIntervention,
  MODELED_IMPACT_ASSUMPTIONS,
} from "../src/compare.ts";
import { RoutingError } from "../src/errors.ts";
import type { PedestrianGraph } from "../src/types.ts";

function freezeGraph(graph: PedestrianGraph): PedestrianGraph {
  for (const node of graph.nodes) {
    if (node.coordinates) Object.freeze(node.coordinates);
    Object.freeze(node);
  }
  for (const edge of graph.edges) Object.freeze(edge);
  Object.freeze(graph.nodes);
  Object.freeze(graph.edges);
  return Object.freeze(graph);
}

const query = {
  originId: "home",
  destinationId: "library",
  requireAccessible: true,
};

test("opens an inaccessible shortcut and recomputes both distances", () => {
  const graph = freezeGraph({
    nodes: [
      { id: "home", coordinates: [0, 0] },
      { id: "ramp", coordinates: [1, 0] },
      { id: "library", coordinates: [1, 1] },
    ],
    edges: [
      { id: "home-ramp", from: "home", to: "ramp", lengthMeters: 40, accessible: false },
      { id: "ramp-library", from: "ramp", to: "library", lengthMeters: 30, accessible: true },
      { id: "home-library", from: "home", to: "library", lengthMeters: 200, accessible: true },
    ],
  });

  const comparison = compareIntervention(graph, query, [
    { edgeId: "home-ramp", accessible: true },
  ]);

  assert.equal(comparison.beforeMeters, 200);
  assert.equal(comparison.afterMeters, 70);
  assert.equal(comparison.deltaMeters, -130);
  assert.equal(comparison.becameReachable, false);
  assert.deepEqual(comparison.before.edgeIds, ["home-library"]);
  assert.deepEqual(comparison.after.edgeIds, ["home-ramp", "ramp-library"]);
  assert.deepEqual(comparison.after.geometry, [
    [0, 0],
    [1, 0],
    [1, 1],
  ]);
  assert.deepEqual(comparison.assumptions, [...MODELED_IMPACT_ASSUMPTIONS]);
  assert.equal(graph.edges[0]?.accessible, false);
});

test("before and after meters track independently sampled edge lengths", () => {
  let seed = 20261121;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed % 90) + 10;
  };

  for (let trial = 0; trial < 25; trial += 1) {
    const shortcutA = next();
    const shortcutB = next();
    const longWay = shortcutA + shortcutB + 40;
    const graph: PedestrianGraph = {
      nodes: [{ id: "home" }, { id: "ramp" }, { id: "library" }],
      edges: [
        {
          id: "home-ramp",
          from: "home",
          to: "ramp",
          lengthMeters: shortcutA,
          accessible: false,
        },
        {
          id: "ramp-library",
          from: "ramp",
          to: "library",
          lengthMeters: shortcutB,
          accessible: true,
        },
        {
          id: "home-library",
          from: "home",
          to: "library",
          lengthMeters: longWay,
          accessible: true,
        },
      ],
    };

    const comparison = compareIntervention(graph, query, [
      { edgeId: "home-ramp", accessible: true },
    ]);

    assert.equal(comparison.beforeMeters, longWay);
    assert.equal(comparison.afterMeters, shortcutA + shortcutB);
    assert.equal(comparison.deltaMeters, shortcutA + shortcutB - longWay);
    assert.notEqual(comparison.beforeMeters, comparison.afterMeters);
  }
});

test("marks a trip that was blocked and becomes possible", () => {
  const comparison = compareIntervention(
    {
      nodes: [{ id: "home" }, { id: "library" }],
      edges: [
        { id: "only", from: "home", to: "library", lengthMeters: 55, accessible: false },
      ],
    },
    query,
    [{ edgeId: "only", accessible: true }],
  );

  assert.equal(comparison.before.reachable, false);
  assert.equal(comparison.beforeMeters, null);
  assert.equal(comparison.afterMeters, 55);
  assert.equal(comparison.deltaMeters, null);
  assert.equal(comparison.becameReachable, true);
});

test("keeps after unreachable when the intervention does not connect the trip", () => {
  const comparison = compareIntervention(
    {
      nodes: [{ id: "home" }, { id: "side" }, { id: "library" }],
      edges: [
        { id: "home-side", from: "home", to: "side", lengthMeters: 8, accessible: false },
      ],
    },
    query,
    [{ edgeId: "home-side", accessible: true }],
  );

  assert.equal(comparison.before.reachable, false);
  assert.equal(comparison.after.reachable, false);
  assert.equal(comparison.becameReachable, false);
  assert.equal(comparison.deltaMeters, null);
});

test("empty graphChanges still recomputes and leaves the trip unchanged", () => {
  const graph: PedestrianGraph = {
    nodes: [{ id: "home" }, { id: "library" }],
    edges: [
      { id: "home-library", from: "home", to: "library", lengthMeters: 18, accessible: true },
    ],
  };
  const comparison = compareIntervention(graph, query, []);
  assert.equal(comparison.beforeMeters, 18);
  assert.equal(comparison.afterMeters, 18);
  assert.equal(comparison.deltaMeters, 0);
  assert.deepEqual(comparison.before.edgeIds, comparison.after.edgeIds);
});

test("later edits to the same edge win, and weight is search-only", () => {
  const graph: PedestrianGraph = {
    nodes: [{ id: "home" }, { id: "library" }],
    edges: [
      {
        id: "cheap-long",
        from: "home",
        to: "library",
        lengthMeters: 400,
        weight: 1,
        accessible: true,
      },
      {
        id: "costly-short",
        from: "home",
        to: "library",
        lengthMeters: 20,
        weight: 50,
        accessible: true,
      },
    ],
  };

  const comparison = compareIntervention(graph, query, [
    { edgeId: "costly-short", accessible: true, weight: 80 },
    { edgeId: "costly-short", accessible: true, weight: 0 },
  ]);

  assert.equal(comparison.beforeMeters, 400);
  assert.equal(comparison.afterMeters, 20);
  assert.deepEqual(comparison.after.edgeIds, ["costly-short"]);
});

test("applyGraphChanges copies edges and rejects unknown ids", () => {
  const graph = freezeGraph({
    nodes: [{ id: "home" }, { id: "library" }],
    edges: [
      { id: "home-library", from: "home", to: "library", lengthMeters: 12, accessible: false },
    ],
  });
  const next = applyGraphChanges(graph, [
    { edgeId: "home-library", accessible: true },
  ]);
  assert.equal(graph.edges[0]?.accessible, false);
  assert.equal(next.edges[0]?.accessible, true);
  assert.notEqual(next.edges[0], graph.edges[0]);
  assert.equal(next.nodes, graph.nodes);

  assert.throws(
    () => applyGraphChanges(graph, [{ edgeId: "missing", accessible: true }]),
    RoutingError,
  );
});
