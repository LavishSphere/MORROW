import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("README runbook says how to open the demo and what fallbacks do", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.equal(readme.includes("## Open the demo"), true);
  assert.equal(readme.includes("Public URL"), true);
  assert.equal(readme.includes("GitHub Pages"), true);
  assert.equal(readme.includes("No login"), true);
  assert.equal(readme.includes("custom domain"), true);
  assert.equal(readme.includes("npm run dev"), true);
  assert.equal(readme.includes("What the fallbacks do"), true);
  assert.equal(readme.includes("List (2D)"), true);
  assert.equal(readme.includes("compareScenario"), true);
  assert.equal(readme.includes("wellesley-demo-01"), true);
  assert.equal(readme.includes("wellesley-intervention-ramp-01"), true);
});

test("client API_STATUS is the shipped outage path", async () => {
  const text = await readFile("src/data/api.ts", "utf8");
  assert.match(text, /barriersApi:\s*false/);
  assert.match(text, /generateApi:\s*false/);
  assert.match(text, /gemini:\s*false/);
  assert.match(text, /tigerData:\s*false/);
  assert.match(text, /morrowRouting:\s*true/);
  assert.equal(
    text.includes("Bundled Wellesley fixtures — live barrier API unavailable"),
    true,
  );
  assert.equal(
    text.includes("Generate API unavailable — using local template draft"),
    true,
  );
  assert.equal(
    text.includes("Gemini unavailable — template prose only"),
    true,
  );
});

test("Pages deploy uses a relative Vite base", async () => {
  const deploy = await readFile(".github/workflows/deploy.yml", "utf8");
  assert.match(deploy, /VITE_BASE=\.\//);
  assert.equal(deploy.includes('src="./assets/'), true);
  const vite = await readFile("vite.config.ts", "utf8");
  assert.match(vite, /process\.env\.VITE_BASE/);
});
