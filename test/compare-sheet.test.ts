import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Compare shows the resident's fixes and no invented cost", async () => {
  const app = await readFile("src/App.tsx", "utf8");
  const sheet = await readFile("src/components/CompareSheet.tsx", "utf8");
  assert.match(app, /panelMode === 'compare' && <CompareSheet \/>/);
  // The showcase route is gone; Compare is about the resident's own fixes.
  assert.equal(sheet.includes("compareByIds"), false);
  assert.match(sheet, /<IssueComparisons \/>/);
  assert.match(sheet, /Not a Gemini estimate/);
  assert.equal(sheet.includes("amountUsd"), false);
  assert.equal(sheet.includes("4800"), false);
  assert.equal(sheet.includes("buildStubGeminiCostEstimate"), false);
});
