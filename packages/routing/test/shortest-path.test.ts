import assert from "node:assert/strict";
import { test } from "node:test";
import { RoutingError } from "../src/errors.ts";
import { haversineMeters } from "../src/from-geojson.ts";
import { shortestPath } from "../src/shortest-path.ts";
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

test("skips an inaccessible shortcut and reports length, not a constant", () => {
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

  const accessible = shortestPath(graph, {
    originId: "home",
    destinationId: "library",
    requireAccessible: true,
  });
  assert.equal(accessible.reachable, true);
  assert.equal(accessible.distanceMeters, 200);
  assert.deepEqual(accessible.nodeIds, ["home", "library"]);
  assert.deepEqual(accessible.edgeIds, ["home-library"]);
  assert.deepEqual(accessible.geometry, [
    [0, 0],
    [1, 1],
  ]);

  const walking = shortestPath(graph, {
    originId: "home",
    destinationId: "library",
    requireAccessible: false,
  });
  assert.equal(walking.distanceMeters, 70);
  assert.deepEqual(walking.nodeIds, ["home", "ramp", "library"]);
});

test("uses weight for the search and length for the reported distance", () => {
  const graph: PedestrianGraph = {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      {
        id: "short-cost-long-walk",
        from: "a",
        to: "b",
        lengthMeters: 500,
        weight: 1,
        accessible: true,
      },
      {
        id: "long-cost-short-walk",
        from: "a",
        to: "b",
        lengthMeters: 25,
        weight: 50,
        accessible: true,
      },
    ],
  };
  const path = shortestPath(graph, {
    originId: "a",
    destinationId: "b",
    requireAccessible: true,
  });
  assert.equal(path.distanceMeters, 500);
  assert.deepEqual(path.edgeIds, ["short-cost-long-walk"]);
});

test("returns an empty path when no accessible route exists", () => {
  const path = shortestPath(
    {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "only", from: "a", to: "b", lengthMeters: 10, accessible: false }],
    },
    { originId: "a", destinationId: "b", requireAccessible: true },
  );
  assert.deepEqual(path, {
    reachable: false,
    distanceMeters: null,
    nodeIds: [],
    edgeIds: [],
    geometry: [],
  });
});

test("a trip that starts where it ends is zero meters", () => {
  const path = shortestPath(
    {
      nodes: [{ id: "a", coordinates: [4, 5] }],
      edges: [],
    },
    { originId: "a", destinationId: "a", requireAccessible: true },
  );
  assert.equal(path.reachable, true);
  assert.equal(path.distanceMeters, 0);
  assert.deepEqual(path.geometry, [[4, 5]]);
});

test("omits geometry when a node on the path has no coordinates", () => {
  const path = shortestPath(
    {
      nodes: [{ id: "a", coordinates: [0, 0] }, { id: "b" }],
      edges: [{ id: "ab", from: "a", to: "b", lengthMeters: 12, accessible: true }],
    },
    { originId: "a", destinationId: "b", requireAccessible: true },
  );
  assert.equal(path.distanceMeters, 12);
  assert.deepEqual(path.geometry, []);
});

test("matches an independently computed path across random lengths", () => {
  let seed = 20261121;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed % 90) + 10;
  };

  for (let trial = 0; trial < 25; trial += 1) {
    const viaNorth = next();
    const northToEnd = next();
    const viaSouth = next();
    const southToEnd = next();
    const graph: PedestrianGraph = {
      nodes: [{ id: "start" }, { id: "north" }, { id: "south" }, { id: "end" }],
      edges: [
        { id: "start-north", from: "start", to: "north", lengthMeters: viaNorth, accessible: true },
        { id: "north-end", from: "north", to: "end", lengthMeters: northToEnd, accessible: true },
        { id: "start-south", from: "start", to: "south", lengthMeters: viaSouth, accessible: true },
        { id: "south-end", from: "south", to: "end", lengthMeters: southToEnd, accessible: true },
      ],
    };
    const path = shortestPath(graph, {
      originId: "start",
      destinationId: "end",
      requireAccessible: true,
    });
    const north = viaNorth + northToEnd;
    const south = viaSouth + southToEnd;
    assert.equal(path.distanceMeters, Math.min(north, south));
    if (north !== south) {
      assert.deepEqual(
        path.nodeIds,
        north < south ? ["start", "north", "end"] : ["start", "south", "end"],
      );
    }
  }
});

test("prefers a cheaper multi-hop path over a long direct edge", () => {
  const path = shortestPath(
    {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      edges: [
        { id: "ab", from: "a", to: "b", lengthMeters: 1, accessible: true },
        { id: "bc", from: "b", to: "c", lengthMeters: 1, accessible: true },
        { id: "cd", from: "c", to: "d", lengthMeters: 1, accessible: true },
        { id: "ad", from: "a", to: "d", lengthMeters: 10, accessible: true },
      ],
    },
    { originId: "a", destinationId: "d", requireAccessible: true },
  );
  assert.equal(path.distanceMeters, 3);
  assert.deepEqual(path.nodeIds, ["a", "b", "c", "d"]);
});

test("updates a tentative cost when a cheaper approach is found later", () => {
  const path = shortestPath(
    {
      nodes: [{ id: "s" }, { id: "a" }, { id: "b" }, { id: "t" }],
      edges: [
        { id: "s-a", from: "s", to: "a", lengthMeters: 10, accessible: true },
        { id: "s-b", from: "s", to: "b", lengthMeters: 1, accessible: true },
        { id: "b-a", from: "b", to: "a", lengthMeters: 1, accessible: true },
        { id: "a-t", from: "a", to: "t", lengthMeters: 1, accessible: true },
      ],
    },
    { originId: "s", destinationId: "t", requireAccessible: true },
  );
  assert.equal(path.distanceMeters, 3);
  assert.deepEqual(path.nodeIds, ["s", "b", "a", "t"]);
});

test("breaks equal-cost ties by scanning edges in id order", () => {
  const path = shortestPath(
    {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { id: "z-later", from: "a", to: "b", lengthMeters: 8, accessible: true },
        { id: "a-first", from: "a", to: "b", lengthMeters: 8, accessible: true },
      ],
    },
    { originId: "a", destinationId: "b", requireAccessible: true },
  );
  assert.deepEqual(path.edgeIds, ["a-first"]);
});

test("rejects a broken graph and unknown stops", () => {
  assert.throws(
    () =>
      shortestPath(
        {
          nodes: [{ id: "a" }],
          edges: [{ id: "loop", from: "a", to: "missing", lengthMeters: 1, accessible: true }],
        },
        { originId: "a", destinationId: "a", requireAccessible: true },
      ),
    RoutingError,
  );
  assert.throws(
    () =>
      shortestPath(
        { nodes: [{ id: "a" }], edges: [] },
        { originId: "missing", destinationId: "a", requireAccessible: true },
      ),
    /Unknown origin/,
  );
  assert.throws(
    () =>
      shortestPath(
        { nodes: [{ id: "a" }], edges: [] },
        { originId: "a", destinationId: "missing", requireAccessible: true },
      ),
    /Unknown destination/,
  );
});

test("A* with coordinates still prefers the cheaper geographic corridor", () => {
  const start: [number, number] = [0, 0];
  const east: [number, number] = [0.002, 0];
  const dest: [number, number] = [0.004, 0];
  const north: [number, number] = [0, 0.02];
  const graph: PedestrianGraph = {
    nodes: [
      { id: "start", coordinates: start },
      { id: "east", coordinates: east },
      { id: "dest", coordinates: dest },
      { id: "north", coordinates: north },
    ],
    edges: [
      {
        id: "start-east",
        from: "start",
        to: "east",
        lengthMeters: haversineMeters(start, east),
        accessible: true,
      },
      {
        id: "east-dest",
        from: "east",
        to: "dest",
        lengthMeters: haversineMeters(east, dest),
        accessible: true,
      },
      {
        id: "start-north",
        from: "start",
        to: "north",
        lengthMeters: haversineMeters(start, north),
        accessible: true,
      },
      {
        id: "north-dest",
        from: "north",
        to: "dest",
        lengthMeters: haversineMeters(north, dest),
        accessible: true,
      },
    ],
  };
  const path = shortestPath(graph, {
    originId: "start",
    destinationId: "dest",
    requireAccessible: true,
  });
  assert.deepEqual(path.nodeIds, ["start", "east", "dest"]);
  assert.equal(
    path.distanceMeters,
    haversineMeters(start, east) + haversineMeters(east, dest),
  );
});

test("drops the heuristic when a weight is cheaper than straight-line distance", () => {
  const start: [number, number] = [0, 0];
  const dest: [number, number] = [0.001, 0];
  const far: [number, number] = [1, 0];
  const graph: PedestrianGraph = {
    nodes: [
      { id: "s", coordinates: start },
      { id: "t", coordinates: dest },
      { id: "b", coordinates: far },
    ],
    edges: [
      {
        id: "direct-expensive",
        from: "s",
        to: "t",
        lengthMeters: 1000,
        weight: 1000,
        accessible: true,
      },
      {
        id: "s-far",
        from: "s",
        to: "b",
        lengthMeters: 1,
        weight: 1,
        accessible: true,
      },
      {
        id: "far-t",
        from: "b",
        to: "t",
        lengthMeters: 1,
        weight: 1,
        accessible: true,
      },
    ],
  };
  const path = shortestPath(graph, {
    originId: "s",
    destinationId: "t",
    requireAccessible: true,
  });
  assert.equal(path.distanceMeters, 2);
  assert.deepEqual(path.nodeIds, ["s", "b", "t"]);
});
