import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the Gemini cost stub does not invent a dollar amount", async () => {
  const source = await readFile("src/satellite/stats/geminiEstimate.ts", "utf8");
  assert.equal(source.includes("4800"), false);
  assert.equal(source.includes("STUB_COST_USD"), false);
  assert.match(source, /amountUsd: null/);
  assert.match(source, /No Gemini estimate/);
  assert.match(source, /Does not call Gemini/);
});
