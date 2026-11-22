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
  assert.match(city, /<ProposedStreetImprovements furniture=\{furniture\} spots=\{built\.proposed\} \/>/);
  assert.match(city, /kind="garbage"/);
  assert.match(city, /kind="recycling"/);
  for (const id of ["add-garbage-cans", "add-recycling"]) {
    assert.ok(STREET_IMPROVEMENTS.some((item) => item.id === id), `${id} is a known improvement`);
  }
});

test("proposed cans are distinct from existing furniture and stay out of click targets", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const can = city.slice(city.indexOf("function ProposedCans"), city.indexOf("function ProposedStreetImprovements"));
  assert.ok(can.length > 0);
  const trash = city.match(/const TRASH_BODY = "(#[0-9a-f]+)"/)?.[1];
  assert.equal(trash, "#5b6f78");
  assert.notEqual(trash, city.match(/const RECYCLE_BODY = "(#[0-9a-f]+)"/)?.[1]);
  assert.match(can, /<ProposedRings/);
  // Cans are drawn with the shared instanced helper, which never takes pointer hits.
  const parts = can.match(/<Instanced\b[^\n]*/g) ?? [];
  assert.ok(parts.length >= 3);
  const instanced = city.slice(city.indexOf("function Instanced"), city.indexOf("type Furniture"));
  assert.match(instanced, /m\.raycast = \(\) => null/);
});

test("cans sit beside benches and at curbs, with recycling paired to each station", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(city, /benches\.map\(\(bench\) => stepAlong\(bench, BENCH_BIN_STEP\)\)/);
  assert.match(city, /const curbBins = roadWays\.flatMap/);
  assert.match(city, /garbage: garbageSpots,\s*stations: garbageSpots,/);
  assert.match(city, /stepAlong\(station, RECYCLE_PAIR_STEP\)/);
});
