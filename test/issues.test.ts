import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolveGenerateInput, resolveIssues } from "../packages/api/src/facts.ts";
import { detectIssues, measureIssue } from "../shared/issues.ts";

const town = JSON.parse(await readFile("data/wellesley/town.geojson", "utf8"));

test("issues come from real OpenStreetMap tags in the town map", () => {
  const issues = detectIssues(town);
  const kinds = new Set(issues.map((issue) => issue.kind));
  for (const kind of ["stairs", "unmarked_crossing", "no_sidewalk", "unpaved_path"]) {
    assert.ok(kinds.has(kind as never), `no ${kind} issues found`);
  }
  for (const issue of issues) {
    assert.match(issue.id, /^(stairs|unmarked_crossing|no_sidewalk|unpaved_path)-\d+$/);
    assert.equal(issue.evidenceStatus, "community_reported");
    assert.match(issue.sourceUrl, /^https:\/\/www\.openstreetmap\.org\/way\/\d+$/);
    assert.ok(issue.line.length >= 2);
  }
});

test("fixing stairs is modeled with the routing graph", () => {
  const stairs = detectIssues(town).find((issue) => issue.id === "stairs-1328680411");
  assert.ok(stairs, "known stairs near Crest Road");
  const measure = measureIssue(stairs, town);
  assert.equal(measure.modeled, true);
  assert.deepEqual(
    measure.metrics.map((m) => m.value),
    ["245 m", "27 m"],
  );
  assert.ok(measure.assumptions.length > 0);
});

test("very short stairs are not given a made-up detour", () => {
  const short = detectIssues(town).find((issue) => issue.where === "Sudbury Path");
  assert.ok(short);
  const measure = measureIssue(short, town);
  assert.equal(measure.modeled, false);
  assert.match(measure.before, /short flight of stairs/);
});

test("the API rebuilds issue facts from ids and rejects unknown ids", () => {
  const ids = ["stairs-1328680411", "no_sidewalk-9334837"];
  const facts = resolveIssues(ids);
  assert.deepEqual(
    facts.map((f) => f.id),
    ids,
  );
  assert.equal(facts[0]?.modeled, true);
  assert.throws(() => resolveIssues(["stairs-1"]), /Unknown issueId/);

  const resolved = resolveGenerateInput({
    scenarioId: "wellesley-demo-01",
    barrierId: "wellesley-barrier-campus-path-01",
    interventionId: "wellesley-intervention-ramp-01",
    issueIds: ids,
  });
  assert.equal(resolved.facts.issues?.length, 2);
  // Without issue ids the proposal is unchanged.
  const plain = resolveGenerateInput({
    scenarioId: "wellesley-demo-01",
    barrierId: "wellesley-barrier-campus-path-01",
    interventionId: "wellesley-intervention-ramp-01",
  });
  assert.equal(plain.facts.issues, undefined);
});

test("Improve, Compare, and Propose use the map's issues", async () => {
  const improve = await readFile("src/components/ImprovePage.tsx", "utf8");
  const compare = await readFile("src/components/CompareSheet.tsx", "utf8");
  const propose = await readFile("src/components/ProposeSheet.tsx", "utf8");
  const editor = await readFile("src/components/ProposalEditor.tsx", "utf8");
  const api = await readFile("src/data/api.ts", "utf8");
  const app = await readFile("src/App.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const schema = await readFile("packages/api/src/draft/schema.ts", "utf8");
  const gemini = await readFile("packages/api/src/draft/gemini.ts", "utf8");

  assert.match(city, /detectIssues\(source\)/);
  assert.match(city, /<IssueLayer \/>/);
  assert.match(improve, /<IssueBrowser \/>/);
  assert.match(compare, /<IssueComparisons \/>/);
  assert.match(propose, /<ProposalIssuePicker \/>/);
  assert.match(propose, /issueIds/);
  assert.match(editor, /<ProposalIssueFacts issues=\{facts\.issues \?\? \[\]\} \/>/);
  assert.match(api, /issueIds: req\.issueIds/);
  assert.match(app, /setMode\('improve'\)/);
  assert.match(schema, /issueIds: z\.array\(z\.string\(\)\.min\(1\)\.max\(120\)\)\.max\(12\)\.optional\(\)/);
  assert.match(gemini, /additionalIssues/);
});
