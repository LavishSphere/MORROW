import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  getPotholeFix,
  patchPothole,
  resetPotholeFix,
  selectPothole,
} from "../src/city/potholeFix.ts";

test("a clicked pothole can be patched without inventing a route", () => {
  resetPotholeFix();
  selectPothole("boulevard-pothole-2");
  assert.equal(getPotholeFix().selectedId, "boulevard-pothole-2");
  assert.deepEqual(getPotholeFix().patchedIds, []);
  patchPothole("boulevard-pothole-2");
  assert.deepEqual(getPotholeFix().patchedIds, ["boulevard-pothole-2"]);
  selectPothole("not-a-hole");
  assert.equal(getPotholeFix().selectedId, "boulevard-pothole-2");
  resetPotholeFix();
});

test("the city popup and the three mode pages share the pothole", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const popup = await readFile("src/components/PotholePopup.tsx", "utf8");
  const improve = await readFile("src/components/ImprovePage.tsx", "utf8");
  const compare = await readFile("src/components/CompareSheet.tsx", "utf8");
  const propose = await readFile("src/components/ProposeSheet.tsx", "utf8");
  assert.match(city, /selectPothole\(/);
  assert.match(popup, /patchPothole\(/);
  assert.match(popup, /Illustrative street issue/);
  assert.match(improve, /patchPothole\(/);
  assert.match(compare, /usePotholeFix\(/);
  assert.match(compare, /Not a Gemini estimate/);
  assert.match(propose, /usePotholeFix\(/);
  assert.equal(compare.includes("amountUsd"), false);
});
