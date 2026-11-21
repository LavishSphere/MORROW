import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { clearProposals } from "../src/data/proposals.ts";
import { buildTemplateDraft } from "../src/draft/template.ts";
import { resolveGenerateInput } from "../src/facts.ts";
import { createApiServer } from "../src/server.ts";
import type { ProposalFacts } from "../../../shared/types.ts";

const server = createApiServer();
let baseUrl = "";

before(async () => {
  clearProposals();
  delete process.env.GEMINI_API_KEY;
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function json(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = (await res.json()) as unknown;
  return { status: res.status, body };
}

test("GET /api/health reports template-only without Gemini key", async () => {
  delete process.env.MORROW_HOSTED_ON;
  const { status, body } = await json("/api/health");
  assert.equal(status, 200);
  const record = body as Record<string, unknown>;
  assert.equal(record.ok, true);
  assert.equal(record.geminiConfigured, false);
  assert.equal(record.tigerData, false);
  assert.equal(record.databaseUrlConfigured, false);
  assert.equal(record.mastra, true);
  assert.equal(record.vultr, false);
});

test("GET /api/health reports vultr when MORROW_HOSTED_ON=vultr", async () => {
  process.env.MORROW_HOSTED_ON = "vultr";
  try {
    const { status, body } = await json("/api/health");
    assert.equal(status, 200);
    assert.equal((body as { vultr: boolean }).vultr, true);
  } finally {
    delete process.env.MORROW_HOSTED_ON;
  }
});

test("GET /api/barriers?bbox= returns bundled Wellesley barrier", async () => {
  const { status, body } = await json(
    "/api/barriers?bbox=-71.3085,42.291,-71.3005,42.2968",
  );
  assert.equal(status, 200);
  const record = body as { barriers: Array<{ id: string }>; tigerData: boolean };
  assert.equal(record.tigerData, false);
  assert.ok(
    record.barriers.some((b) => b.id === "wellesley-barrier-campus-path-01"),
  );
});

test("GET /api/barriers rejects missing bbox", async () => {
  const { status } = await json("/api/barriers");
  assert.equal(status, 400);
});

test("GET /api/barriers/:id returns one barrier", async () => {
  const { status, body } = await json(
    "/api/barriers/wellesley-barrier-campus-path-01",
  );
  assert.equal(status, 200);
  assert.equal(
    (body as { id: string }).id,
    "wellesley-barrier-campus-path-01",
  );
});

test("GET /api/barriers/:id 404s for unknown id", async () => {
  const { status } = await json("/api/barriers/does-not-exist");
  assert.equal(status, 404);
});

test("POST /api/proposals/generate uses template without GEMINI_API_KEY", async () => {
  clearProposals();
  const { status, body } = await json("/api/proposals/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId: "wellesley-demo-01",
      barrierId: "wellesley-barrier-campus-path-01",
      interventionId: "wellesley-intervention-ramp-01",
    }),
  });
  assert.equal(status, 201);
  const record = body as {
    proposalId: string;
    aiGenerated: boolean;
    geminiAvailable: boolean;
    apiAvailable: boolean;
    mastra: boolean;
    workflowSteps: string[];
    facts: ProposalFacts;
    draft: { headline: string };
    warnings: string[];
  };
  assert.equal(record.aiGenerated, false);
  assert.equal(record.geminiAvailable, false);
  assert.equal(record.apiAvailable, true);
  assert.equal(record.mastra, true);
  assert.deepEqual(record.workflowSteps, [
    "validate-ids",
    "load-evidence",
    "collect-route-metrics",
    "generate-draft",
    "check-draft",
    "return-proposal",
  ]);
  assert.ok(record.proposalId.length > 8);
  // Before may be null when the demo trip is unreachable until the intervention.
  assert.ok(
    record.facts.beforeMeters === null ||
      typeof record.facts.beforeMeters === "number",
  );
  assert.equal(typeof record.facts.afterMeters, "number");
  assert.ok(record.facts.afterMeters !== null);
  assert.ok(record.facts.originLabel);
  assert.ok(record.facts.destinationLabel);
  assert.ok(record.facts.nextSteps);
  assert.ok(record.draft.headline.length > 0);
  assert.ok(record.warnings.some((w) => /GEMINI_API_KEY/i.test(w)));

  const got = await json(`/api/proposals/${record.proposalId}`);
  assert.equal(got.status, 200);
  assert.equal(
    (got.body as { proposalId: string }).proposalId,
    record.proposalId,
  );
});

test("POST /api/proposals/generate rejects unknown ids", async () => {
  const { status, body } = await json("/api/proposals/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioId: "nope",
      barrierId: "wellesley-barrier-campus-path-01",
      interventionId: "wellesley-intervention-ramp-01",
    }),
  });
  assert.equal(status, 400);
  assert.match((body as { error: string }).error, /scenarioId/i);
});

test("resolveGenerateInput recomputes meters via @morrow/routing", () => {
  const resolved = resolveGenerateInput({
    scenarioId: "wellesley-demo-01",
    barrierId: "wellesley-barrier-campus-path-01",
    interventionId: "wellesley-intervention-ramp-01",
  });
  // Wellesley demo: before is blocked (null), after becomes reachable.
  assert.equal(resolved.facts.beforeMeters, null);
  assert.equal(typeof resolved.facts.afterMeters, "number");
  assert.ok(resolved.facts.afterMeters !== null);
  assert.equal(resolved.facts.newlyReachableDestinations, 1);
  // Client cannot inject meters — these come from compareScenario.
  assert.notEqual(resolved.facts.afterMeters, 99999);
});

test("template draft matches PDF DraftProposal shape", () => {
  const facts = resolveGenerateInput({
    scenarioId: "wellesley-demo-01",
    barrierId: "wellesley-barrier-campus-path-01",
    interventionId: "wellesley-intervention-ramp-01",
  }).facts;
  const draft = buildTemplateDraft(facts);
  assert.ok(draft.headline);
  assert.ok(draft.plainLanguageSummary);
  assert.ok(draft.requestForReview);
  assert.ok(draft.meetingTalkingPoints.length >= 1);
  assert.ok(draft.limitations);
});
