import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { generateRequestSchema, hasSubject } from "../packages/api/src/draft/schema.ts";
import { resolveGenerateInput } from "../packages/api/src/facts.ts";

const issue = {
  id: "stairs-1",
  kind: "stairs",
  title: "Stairs with no ramp",
  where: "W 34th St",
  fix: "Add a ramp beside the stairs.",
  before: "Wheelchair users detour",
  after: "Step-free",
  metrics: [{ label: "Detour", value: "180 m" }],
  modeled: false,
};

test("a loaded city's issues reach Gemini as bounded text facts", () => {
  const parsed = generateRequestSchema.parse({ browserIssues: [issue], city: "New York, NY" });
  assert.equal(hasSubject(parsed), true);
  const resolved = resolveGenerateInput(parsed);
  assert.equal(resolved.facts.city, "New York, NY");
  const fact = resolved.facts.issues?.[0];
  // Evidence and source are set by the server, never by the browser.
  assert.equal(fact?.evidenceStatus, "community_reported");
  assert.equal(fact?.sourceUrl, "https://www.openstreetmap.org/copyright");
  assert.ok(resolved.facts.modelAssumptions.some((a) => /did not re-check them/.test(a)));
});

test("browser issues are capped and cannot claim to be verified", () => {
  assert.equal(generateRequestSchema.safeParse({ browserIssues: Array(13).fill(issue) }).success, false);
  assert.equal(generateRequestSchema.safeParse({ browserIssues: [{ ...issue, title: "x".repeat(201) }] }).success, false);
  const parsed = generateRequestSchema.parse({ browserIssues: [{ ...issue, evidenceStatus: "verified" }] });
  assert.equal(resolveGenerateInput(parsed).facts.issues?.[0]?.evidenceStatus, "community_reported");
});

test("local dev drafts through the hosted API by default", async () => {
  const vite = await readFile("vite.config.ts", "utf8");
  assert.match(vite, /process\.env\.VITE_API_PROXY \?\? 'https:\/\/api\.morrow\.khayrul\.com'/);
  const api = await readFile("src/data/api.ts", "utf8");
  assert.match(api, /browserIssues, \.\.\.\(req\.city/);
});
