import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { STREET_IMPROVEMENTS } from "../src/city/streetImprovements.ts";

test("selected garbage and recycling improvements add cans to the map", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(city, /import \{ useStreetImprovements \} from "\.\.\/\.\.\/city\/streetImprovements"/);
  assert.match(city, /function ProposedStreetImprovements/);
  assert.match(city, /useStreetImprovements\(\)/);
  assert.match(city, /selectedIds\.includes\("add-garbage-cans"\)/);
  assert.match(city, /selectedIds\.includes\("add-recycling"\)/);
  assert.match(city, /<ProposedStreetImprovements \/>/);
  assert.match(city, /kind="garbage"/);
  assert.match(city, /kind="recycling"/);
  for (const id of ["add-garbage-cans", "add-recycling"]) {
    assert.ok(STREET_IMPROVEMENTS.some((item) => item.id === id), `${id} is a known improvement`);
  }
});

test("proposed cans are distinct from the plain bin and stay out of click targets", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const can = city.slice(city.indexOf("function ProposedCan"), city.indexOf("function ProposedStreetImprovements"));
  assert.ok(can.length > 0);
  assert.notEqual(city.match(/const TRASH_BODY = "(#[0-9a-f]+)"/)?.[1], "#1f6f7c");
  assert.notEqual(
    city.match(/const TRASH_BODY = "(#[0-9a-f]+)"/)?.[1],
    city.match(/const RECYCLE_BODY = "(#[0-9a-f]+)"/)?.[1],
  );
  assert.match(can, /<ProposedRing/);
  const meshes = can.match(/<mesh\b[^>]*>/g) ?? [];
  assert.ok(meshes.length >= 3);
  for (const mesh of meshes) assert.match(mesh, /raycast=\{\(\) => null\}/);
  // Pothole click target is still interactive.
  assert.match(city, /selectPothole\(id\)/);
});

test("cans sit near crossings, rest points and existing waste stations", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const garbage = city.slice(city.indexOf("const GARBAGE_SPOTS"), city.indexOf("const EXISTING_BIN_SPOTS"));
  for (const at of ["at: 8,", "at: 16,", "at: 7.45,", "at: 18.45,", "at: 12.5,"]) {
    assert.ok(garbage.includes(at), `garbage can at ${at}`);
  }
  assert.match(city, /const EXISTING_BIN_SPOTS = \[\s*\{ at: 6, dist: 3\.1 \},\s*\{ at: 20, dist: 3\.1 \},/);
  assert.match(city, /\[\.\.\.EXISTING_BIN_SPOTS, \.\.\.\(garbage \? GARBAGE_SPOTS : \[\]\)\]/);
  assert.match(city, /at \+ RECYCLE_PAIR_STEP/);
});
