import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { CELL, CHUNK_MIN, cellView, chunkPlacements, LOD_NEAR, VIEW_FAR } from "../src/showcase/scene/chunks.ts";

test("big sets of trees and furniture split into square cells", () => {
  const few = [
    { x: 0, z: 0 },
    { x: 500, z: 500 },
  ];
  assert.deepEqual(chunkPlacements(few), [few]);
  assert.deepEqual(chunkPlacements([]), []);
  const many = Array.from({ length: CHUNK_MIN * 2 }, (_, i) => ({
    x: (i % 40) * 10 - 200,
    z: Math.floor(i / 40) * 10 - 100,
  }));
  const cells = chunkPlacements(many);
  assert.ok(cells.length > 1);
  assert.equal(cells.flat().length, many.length);
  for (const cell of cells) {
    const keys = new Set(cell.map((p) => `${Math.floor(p.x / CELL)}:${Math.floor(p.z / CELL)}`));
    assert.equal(keys.size, 1);
  }
  // Same input, same order: meshes keep their keys across rebuilds.
  assert.deepEqual(chunkPlacements(many), cells);
});

test("far cells draw simpler shapes, and nothing is drawn past the fog", () => {
  assert.equal(cellView(0), "near");
  assert.equal(cellView(LOD_NEAR + 1), "far");
  assert.equal(cellView(VIEW_FAR + 1), "hidden");
  assert.equal(cellView(120, 100), "hidden");
  assert.equal(cellView(500, VIEW_FAR, Infinity), "hidden");
  assert.equal(cellView(200, VIEW_FAR, Infinity), "near");
});

test("the city draws trees by cell, with a simple canopy far away", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(city, /chunkPlacements\(items\)/);
  assert.match(city, /m\.computeBoundingSphere\(\)/);
  assert.match(city, /lod=\{shapes\.canopyFar\}/);
});
