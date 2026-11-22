import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the city no longer draws potholes or a patch popup", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const slot = await readFile("src/components/CanvasSlot.tsx", "utf8");
  const improve = await readFile("src/components/ImprovePage.tsx", "utf8");
  const compare = await readFile("src/components/CompareSheet.tsx", "utf8");
  const propose = await readFile("src/components/ProposeSheet.tsx", "utf8");
  assert.equal(city.includes("function Pothole"), false);
  assert.equal(city.includes("selectPothole"), false);
  assert.equal(slot.includes("PotholePopup"), false);
  assert.equal(improve.includes("pothole"), false);
  assert.equal(compare.includes("pothole"), false);
  assert.equal(propose.includes("pothole"), false);
  assert.equal(propose.includes("draftForPothole"), false);
  assert.match(compare, /Not a Gemini estimate/);
  assert.equal(compare.includes("amountUsd"), false);
});
