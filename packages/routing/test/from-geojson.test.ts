import assert from "node:assert/strict";
import { test } from "node:test";
import { RoutingError } from "../src/errors.ts";
import {
  edgeBelongsToWay,
  fromWalkableGeoJSON,
  haversineMeters,
  wayIdFromEdgeId,
} from "../src/from-geojson.ts";
import { expandWayGraphChanges, snapNearestNode } from "../src/scenario.ts";
import { shortestPath } from "../src/shortest-path.ts";

function feature(
  edgeId: string,
  layer: string,
  coordinates: Array<[number, number]>,
  extra: Record<string, unknown> = {},
) {
  return {
    type: "Feature",
    properties: { edgeId, layer, ...extra },
    geometry: { type: "LineString", coordinates },
  };
}

test("ignores buildings and connects crossing walkable lines", () => {
  const graph = fromWalkableGeoJSON(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { edgeId: "osm-way-building", layer: "building" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        },
        feature("osm-way-h", "footway", [
          [-0.001, 0],
          [0.001, 0],
        ]),
        feature("osm-way-v", "path", [
          [0, -0.001],
          [0, 0.001],
        ]),
      ],
    },
    { endpointStitchMeters: 0 },
  );

  assert.equal(
    graph.edges.some((edge) => edge.id.startsWith("osm-way-building")),
    false,
  );
  const origin = graph.nodes.find(
    (node) => node.coordinates && node.coordinates[0] < -0.0005,
  );
  const destination = graph.nodes.find(
    (node) => node.coordinates && node.coordinates[1] > 0.0005,
  );
  assert.ok(origin && destination);
  const path = shortestPath(graph, {
    originId: origin.id,
    destinationId: destination.id,
    requireAccessible: true,
  });
  assert.equal(path.reachable, true);
  const ways = new Set(path.edgeIds.map(wayIdFromEdgeId));
  assert.equal(ways.has("osm-way-h"), true);
  assert.equal(ways.has("osm-way-v"), true);
});

test("keeps steps blocked and stitches a 9 m endpoint gap", () => {
  const origin: [number, number] = [-71.308, 42.293];
  const north: [number, number] = [-71.308, 42.2933];
  const gapMeters = 9;
  const lonScale = 111_320 * Math.cos((42.293 * Math.PI) / 180);
  const stitched: [number, number] = [north[0] + gapMeters / lonScale, north[1]];
  const far: [number, number] = [stitched[0] + 0.0004, stitched[1]];
  assert.ok(haversineMeters(north, stitched) < 10);
  assert.ok(haversineMeters(north, stitched) > 8);
  assert.ok(haversineMeters(origin, north) > 20);

  const graph = fromWalkableGeoJSON({
    type: "FeatureCollection",
    features: [
      feature("osm-way-left", "footway", [origin, north]),
      feature("osm-way-right", "footway", [stitched, far]),
      feature("osm-way-stairs", "path", [origin, far], { highway: "steps" }),
    ],
  });

  const start = snapNearestNode(graph, origin);
  const end = snapNearestNode(graph, far);
  const accessible = shortestPath(graph, {
    originId: start,
    destinationId: end,
    requireAccessible: true,
  });
  assert.equal(accessible.reachable, true);
  assert.equal(
    accessible.edgeIds.some((id) => wayIdFromEdgeId(id) === "osm-way-stairs"),
    false,
  );
  const ways = new Set(accessible.edgeIds.map(wayIdFromEdgeId));
  assert.equal(ways.has("osm-way-left"), true);
  assert.equal(ways.has("osm-way-right"), true);
});

test("expandWayGraphChanges maps a way id onto every directed segment", () => {
  const graph = fromWalkableGeoJSON(
    {
      type: "FeatureCollection",
      features: [
        feature("osm-way-blocked", "footway", [
          [0, 0],
          [0.0002, 0],
          [0.0004, 0],
        ]),
      ],
    },
    { inaccessibleWayIds: ["osm-way-blocked"], endpointStitchMeters: 0 },
  );
  assert.equal(
    graph.edges.every((edge) => edge.accessible === false),
    true,
  );
  const expanded = expandWayGraphChanges(graph, [
    { edgeId: "osm-way-blocked", accessible: true, weight: 40 },
  ]);
  assert.equal(expanded.length, graph.edges.length);
  assert.equal(
    expanded.every((change) => edgeBelongsToWay(change.edgeId, "osm-way-blocked")),
    true,
  );
  const weightSum = expanded.reduce((sum, change) => sum + (change.weight ?? 0), 0);
  assert.ok(Math.abs(weightSum - 40) < 1e-9);
});

test("rejects a basemap with no walkable lines", () => {
  assert.throws(
    () => fromWalkableGeoJSON({ type: "FeatureCollection", features: [] }),
    RoutingError,
  );
});
