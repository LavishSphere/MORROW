import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Propose mode mounts the honest generate sheet", async () => {
  const app = await readFile("src/App.tsx", "utf8");
  const sheet = await readFile("src/components/ProposeSheet.tsx", "utf8");
  const api = await readFile("src/data/api.ts", "utf8");
  assert.match(app, /panelMode === 'propose' && <ProposeSheet \/>/);
  assert.match(sheet, /generateProposal\(/);
  assert.match(sheet, /geminiAvailable=\{result\.geminiAvailable\}/);
  assert.match(sheet, /apiAvailable=\{result\.apiAvailable\}/);
  assert.match(api, /Gemini unavailable — template prose only/);
  assert.match(api, /aiGenerated: false/);
});
