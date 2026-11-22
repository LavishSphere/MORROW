import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolveGenerateInput, resolveIssues } from "../packages/api/src/facts.ts";
import { buildIssuesDraft, detectIssues, measureIssue } from "../shared/issues.ts";

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
  assert.match(city, /<IssueLayer reducedMotion=\{reducedMotion\} \/>/);
  assert.match(improve, /<IssueBrowser \/>/);
  assert.match(compare, /<IssueComparisons \/>/);
  assert.match(propose, /<ProposalIssuePicker \/>/);
  assert.match(propose, /issueIds: \[\.\.\.chosen\]/);
  assert.match(editor, /<ProposalIssueFacts issues=\{facts\.issues \?\? \[\]\} \/>/);
  assert.match(api, /issueIds: req\.issueIds/);
  // The showcase scenario is gone from the screens.
  assert.equal(improve.includes('Showcase'), false);
  assert.equal(compare.includes('compareByIds'), false);
  assert.equal(propose.includes('getDemoScenario'), false);
  assert.match(app, /setMode\('improve'\)/);
  assert.match(schema, /issueIds: z\.array\(z\.string\(\)\.min\(1\)\.max\(120\)\)\.max\(12\)\.optional\(\)/);
  assert.match(gemini, /additionalIssues/);
});

test("a busy or slow Gemini moves on to the next model instead of hanging", async () => {
  const gemini = await readFile("packages/api/src/draft/gemini.ts", "utf8");
  assert.match(gemini, /const CALL_TIMEOUT_MS = 12_000;/);
  assert.match(gemini, /withTimeout\(/);
  assert.match(gemini, /timed out/);
  // gemini-3.8-flash first, then every other model the key can see, inside one time budget.
  assert.match(gemini, /requestDraft\(ai, facts, PRIMARY_MODEL, PRIMARY_TIMEOUT_MS\)/);
  assert.match(gemini, /const PRIMARY_TIMEOUT_MS = 22_000;/);
  assert.match(gemini, /for \(const model of modelCandidates\(geminiModel\(\), await availableModels\(ai\)\)\)/);
  assert.match(gemini, /const TOTAL_BUDGET_MS = 48_000;/);
  // Thinking counts against the output limit, so it is kept low and the limit roomy.
  assert.match(gemini, /maxOutputTokens: 8192/);
  assert.match(gemini, /thinkingLevel: ThinkingLevel\.LOW/);
  const api = await readFile("src/data/api.ts", "utf8");
  assert.match(api, /AbortSignal\.timeout\(55_000\)/);
});

test("a proposal can be the picked issues alone, with no showcase route", () => {
  const ids = ["stairs-1328680411", "unmarked_crossing-856586352"];
  const resolved = resolveGenerateInput({ issueIds: ids });
  assert.equal(resolved.scenarioId, null);
  assert.equal(resolved.facts.scope, "issues");
  assert.equal(resolved.facts.issues?.length, 2);
  assert.equal(resolved.facts.beforeMeters, null);
  assert.equal(resolved.facts.evidenceStatus, "community_reported");
  assert.throws(() => resolveGenerateInput({}), /Pick at least one issue/);
  const draft = buildIssuesDraft(resolved.facts);
  assert.match(draft.headline, /^Fix 2 walking barriers in Wellesley, MA$/);
  assert.equal(draft.meetingTalkingPoints.length, 2);
});

test("freeways, ramps, and bus lanes tagged sidewalk=no are not missing sidewalks", () => {
  const road = (osmId: number, highway: string) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[-71.3, 42.29], [-71.3, 42.2905]] },
    properties: { layer: "road", highway, sidewalk: "no", osmId },
  });
  const issues = detectIssues({
    type: "FeatureCollection",
    features: [road(1, "motorway"), road(2, "motorway_link"), road(3, "busway"), road(4, "residential")],
  });
  assert.deepEqual(
    issues.filter((issue) => issue.kind === "no_sidewalk").map((issue) => issue.id),
    ["no_sidewalk-4"],
  );
});

test("OpenRouter is an optional last resort before the template", async () => {
  const router = await readFile("packages/api/src/draft/openrouter.ts", "utf8");
  const workflow = await readFile("packages/api/src/workflow/proposal.ts", "utf8");
  const gemini = await readFile("packages/api/src/draft/gemini.ts", "utf8");
  // Skipped entirely without a key.
  assert.match(router, /OPENROUTER_API_KEY not set/);
  assert.match(workflow, /if \(!aiGenerated && openRouterConfigured\(\)\)/);
  // Gemini only gives up time for it when the key is there.
  assert.match(gemini, /TOTAL_BUDGET_MS - \(openRouterConfigured\(\) \? OPENROUTER_RESERVE_MS : 0\)/);
  // Gemini 3 models through OpenRouter, 3.8 first, with a capped bill.
  assert.match(router, /"google\/gemini-3\.8-flash",\n {2}"google\/gemini-3\.6-flash",\n {2}"google\/gemini-3\.5-flash-lite",/);
  assert.match(router, /max_tokens: 4096/);
});
