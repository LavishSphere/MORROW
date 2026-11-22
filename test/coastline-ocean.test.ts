import assert from "node:assert/strict";
import { test } from "node:test";
import { insidePolygon, oceanPolygons, rightHandArea, type OceanPolygon, type Pt } from "../src/showcase/scene/coastline.ts";

const rect = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

function wet(polygons: OceanPolygon[], x: number, z: number) {
  return polygons.some(
    (polygon) => insidePolygon(x, z, polygon.outer) && !polygon.holes.some((hole) => insidePolygon(x, z, hole)),
  );
}

test("a straight coast fills only its water side", () => {
  // Heading south (z grows): the right-hand side is west.
  const { polygons, complete } = oceanPolygons([[[0, -100], [0, 100]]], rect);
  assert.equal(complete, true);
  assert.equal(polygons.length, 1);
  assert.ok(Math.abs(Math.abs(rightHandArea(polygons[0]!.outer)) - 5000) < 1e-6);
  assert.equal(wet(polygons, -25, 0), true);
  assert.equal(wet(polygons, 25, 0), false);
});

test("a narrow channel between mainland and a barrier island does not flood either shore", () => {
  const lines: Pt[][] = [
    [[-5, 100], [-5, -100]], // mainland, water east
    [[5, -100], [5, 100]], // barrier island west shore, water west
    [[20, 100], [20, -100]], // barrier island ocean shore, water east
  ];
  const { polygons, complete } = oceanPolygons(lines, rect);
  assert.equal(complete, true);
  assert.equal(wet(polygons, -30, 0), false, "mainland stays dry");
  assert.equal(wet(polygons, 0, 0), true, "the channel is water");
  assert.equal(wet(polygons, 12, 0), false, "the barrier island stays dry");
  assert.equal(wet(polygons, 40, 0), true, "the ocean is water");
});

test("an island inside the box is a hole in the sea", () => {
  const island: Pt[] = [[10, 10], [10, 20], [20, 20], [20, 10], [10, 10]];
  const { polygons, complete } = oceanPolygons([island], rect);
  assert.equal(complete, true);
  assert.equal(wet(polygons, 0, 0), true);
  assert.equal(wet(polygons, 15, 15), false);
});

test("a coast piece that stops inside the box is reported incomplete, not flooded", () => {
  const { polygons, complete } = oceanPolygons([[[0, -100], [0, 10]]], rect);
  assert.equal(complete, false);
  assert.equal(polygons.length, 0);
});

test("coast pieces are joined end to start and never reversed", () => {
  const { polygons, complete } = oceanPolygons(
    [
      [[0, 0], [0, 100]],
      [[0, -100], [0, 0]],
    ],
    rect,
  );
  assert.equal(complete, true);
  assert.equal(wet(polygons, -25, 0), true);
  assert.equal(wet(polygons, 25, 0), false);
});
