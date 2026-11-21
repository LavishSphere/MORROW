import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Compare mode shows modeled meters and no invented cost", async () => {
  const app = await readFile("src/App.tsx", "utf8");
  const sheet = await readFile("src/components/CompareSheet.tsx", "utf8");
  assert.match(app, /mode === 'compare' && <CompareSheet \/>/);
  assert.match(sheet, /compareByIds\(/);
  assert.match(sheet, /Not a Gemini estimate/);
  assert.equal(sheet.includes("amountUsd"), false);
  assert.equal(sheet.includes("4800"), false);
  assert.equal(sheet.includes("buildStubGeminiCostEstimate"), false);
});
