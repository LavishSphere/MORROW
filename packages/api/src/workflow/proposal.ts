/**
 * Mastra proposal workflow (WHA-9 / P1).
 *
 * Typed steps: validate → load evidence → collect route metrics →
 * generate (Gemini or template) → check → return saved proposal.
 *
 * Route meters stay in @morrow/routing; Gemini never invents evidence.
 */

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type {
  DraftProposal,
  GenerateProposalResponse,
  ProposalFacts,
} from "../../../../shared/types.ts";
import {
  getBarrier,
  getIntervention,
  getScenario,
} from "../data/dataset.ts";
import { saveProposal } from "../data/proposals.ts";
import {
  OPENROUTER_HEAD_START_MS,
  draftWithGemini,
  failureKind,
  geminiConfigured,
  openRouterConfigured,
} from "../draft/gemini.ts";
import { draftWithOpenRouter } from "../draft/openrouter.ts";

/** OpenRouter's own limit, so the reply still beats the browser's 55 s wait. */
const ROUTER_TIMEOUT_MS = 30_000;
import {
  draftProposalSchema,
  generateRequestSchema,
  parseDraftProposal,
  hasScenario,
  type GenerateRequest,
} from "../draft/schema.ts";
import { buildTemplateDraft } from "../draft/template.ts";
import { resolveGenerateInput } from "../facts.ts";

const idsSchema = generateRequestSchema;

const evidenceSchema = idsSchema.extend({
  barrierType: z.string(),
  evidenceStatus: z.enum([
    "verified",
    "community_reported",
    "illustrative",
  ]),
  interventionDescription: z.string(),
});

const factsCarrierSchema = evidenceSchema.extend({
  facts: z.custom<ProposalFacts>(),
});

const draftCarrierSchema = factsCarrierSchema.extend({
  draft: draftProposalSchema,
  aiGenerated: z.boolean(),
  warnings: z.array(z.string()),
  geminiAvailable: z.boolean(),
  /** The Gemini model that wrote the draft, or null for the template. */
  draftModel: z.string().nullable(),
});

const savedProposalSchema = z.object({
  proposal: z.custom<GenerateProposalResponse>(),
  stepTrace: z.array(z.string()),
});

export type ProposalWorkflowResult = {
  proposal: GenerateProposalResponse;
  /** Observable Mastra step ids that completed successfully. */
  stepTrace: string[];
  mastra: true;
};

const validateIds = createStep({
  id: "validate-ids",
  description: "Accept only scenarioId, barrierId, and interventionId.",
  inputSchema: idsSchema,
  outputSchema: idsSchema,
  execute: async ({ inputData }) => idsSchema.parse(inputData),
});

const loadEvidence = createStep({
  id: "load-evidence",
  description:
    "Reload canonical barrier, intervention, and scenario from the dataset.",
  inputSchema: idsSchema,
  outputSchema: evidenceSchema,
  execute: async ({ inputData }) => {
    // Issues-only proposal: nothing to load here; issues resolve in the next step.
    if (!hasScenario(inputData)) {
      if (!inputData.issueIds?.length && !inputData.browserIssues?.length) {
        throw new Error("No issues or scenario to propose");
      }
      return {
        ...inputData,
        barrierType: "map_issues",
        evidenceStatus: "community_reported" as const,
        interventionDescription: "",
      };
    }
    const scenario = getScenario(inputData.scenarioId);
    if (!scenario) {
      throw new Error(`Unknown scenarioId: ${inputData.scenarioId}`);
    }
    const barrier = getBarrier(inputData.barrierId);
    if (!barrier) {
      throw new Error(`Unknown barrierId: ${inputData.barrierId}`);
    }
    const intervention = getIntervention(inputData.interventionId);
    if (!intervention) {
      throw new Error(`Unknown interventionId: ${inputData.interventionId}`);
    }
    if (intervention.barrierId !== barrier.id) {
      throw new Error("interventionId does not belong to barrierId");
    }
    if (scenario.barrierId !== barrier.id) {
      throw new Error("barrierId does not match the scenario's barrier");
    }
    if (scenario.interventionId !== intervention.id) {
      throw new Error(
        "interventionId does not match the scenario's intervention",
      );
    }
    return {
      scenarioId: scenario.id,
      barrierId: barrier.id,
      interventionId: intervention.id,
      ...(inputData.issueIds ? { issueIds: inputData.issueIds } : {}),
      barrierType: barrier.type,
      evidenceStatus: barrier.evidenceStatus,
      interventionDescription: intervention.description,
    };
  },
});

const collectRouteMetrics = createStep({
  id: "collect-route-metrics",
  description:
    "Recompute before/after meters via @morrow/routing (never from the client).",
  inputSchema: evidenceSchema,
  outputSchema: factsCarrierSchema,
  execute: async ({ inputData }) => {
    const resolved = resolveGenerateInput({
      scenarioId: inputData.scenarioId,
      barrierId: inputData.barrierId,
      interventionId: inputData.interventionId,
      issueIds: inputData.issueIds,
      browserIssues: inputData.browserIssues,
      city: inputData.city,
    });
    return {
      ...inputData,
      facts: resolved.facts,
    };
  },
});
const generateDraft = createStep({
  id: "generate-draft",
  description: "Draft with Gemini when configured; otherwise the template.",
  inputSchema: factsCarrierSchema,
  outputSchema: draftCarrierSchema,
  execute: async ({ inputData }) => {
    const warnings: string[] = [];
    const keyPresent = geminiConfigured();
    let draft: DraftProposal;
    let aiGenerated = false;
    let draftModel: string | null = null;
    let geminiFailed = "";

    // Free Gemini first. With an OpenRouter key, OpenRouter joins after a head
    // start and the first good draft wins; without one, Gemini alone.
    type Outcome = { source: "gemini" | "openrouter"; ok: boolean; draft?: DraftProposal; model?: string; note: string };
    const router = openRouterConfigured();
    const cancelRouter = new AbortController();
    let settled = false;

    const geminiRun: Promise<Outcome> = keyPresent
      ? draftWithGemini(inputData.facts).then((g): Outcome => {
          if (g.ok) {
            return {
              source: "gemini",
              ok: true,
              draft: g.draft,
              model: g.model,
              note: g.primaryFailure ? `Gemini 3.8 Flash ${g.primaryFailure}, so ${g.model} wrote this draft.` : "",
            };
          }
          console.error("[@morrow/api] Gemini draft skipped:", g.reason);
          return {
            source: "gemini",
            ok: false,
            note: `Gemini did not return a draft (tried ${g.tried.length} model${g.tried.length === 1 ? "" : "s"}; 3.8 Flash ${g.primaryFailure ?? failureKind(g.reason)})`,
          };
        })
      : Promise.resolve({ source: "gemini", ok: false, note: "GEMINI_API_KEY not set" });

    const routerRun: Promise<Outcome> | null = router
      ? (async (): Promise<Outcome> => {
          // Wait out the head start unless Gemini finishes sooner.
          const geminiDone = await Promise.race([
            geminiRun,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), keyPresent ? OPENROUTER_HEAD_START_MS : 0)),
          ]);
          if (geminiDone?.ok || settled) return { source: "openrouter", ok: false, note: "" };
          const r = await draftWithOpenRouter(inputData.facts, ROUTER_TIMEOUT_MS, cancelRouter.signal);
          if (r.ok) return { source: "openrouter", ok: true, draft: r.draft, model: r.model, note: "" };
          if (cancelRouter.signal.aborted) return { source: "openrouter", ok: false, note: "" };
          console.error("[@morrow/api] OpenRouter draft skipped:", r.reason);
          return { source: "openrouter", ok: false, note: `OpenRouter ${failureKind(r.reason)}` };
        })()
      : null;

    const runs = routerRun ? [geminiRun, routerRun] : [geminiRun];
    const winner = await new Promise<Outcome | null>((resolve) => {
      let pending = runs.length;
      for (const run of runs) {
        void run
          .catch((err): Outcome => ({ source: "gemini", ok: false, note: err instanceof Error ? err.message : "failed" }))
          .then((outcome) => {
            let o = outcome;
            if (o.ok && o.draft) {
              try {
                o = { ...o, draft: parseDraftProposal(o.draft) };
                if (!settled) {
                  settled = true;
                  resolve(o);
                }
                return;
              } catch {
                o = { ...o, ok: false, note: `${o.source === "gemini" ? "Gemini" : "OpenRouter"} draft failed schema validation` };
              }
            }
            if (o.note) geminiFailed = geminiFailed ? `${geminiFailed}; ${o.note}` : o.note;
            pending -= 1;
            if (pending === 0 && !settled) {
              settled = true;
              resolve(null);
            }
          });
      }
    });
    // Gemini won: stop paying for an OpenRouter call still in flight.
    cancelRouter.abort();

    if (winner?.draft) {
      draft = winner.draft;
      aiGenerated = true;
      if (winner.source === "openrouter") {
        draftModel = `${winner.model} (OpenRouter)`;
        warnings.push(`Gemini was slow or busy, so ${winner.model} on OpenRouter wrote this draft.`);
      } else {
        draftModel = winner.model ?? null;
        if (winner.note) warnings.push(winner.note);
      }
      geminiFailed = "";
    } else {
      draft = buildTemplateDraft(inputData.facts);
    }

    if (!aiGenerated && geminiFailed) {
      warnings.push(
        keyPresent || openRouterConfigured()
          ? `${geminiFailed}. This proposal uses the template.`
          : "GEMINI_API_KEY not set — using deterministic template (expected for local/outage demos).",
      );
    }

    return {
      ...inputData,
      draft,
      aiGenerated,
      warnings,
      geminiAvailable: keyPresent,
      draftModel,
    };
  },
});

const checkDraft = createStep({
  id: "check-draft",
  description: "Validate DraftProposal shape before save/export.",
  inputSchema: draftCarrierSchema,
  outputSchema: draftCarrierSchema,
  execute: async ({ inputData }) => {
    const draft = parseDraftProposal(inputData.draft);
    return { ...inputData, draft };
  },
});

const returnProposal = createStep({
  id: "return-proposal",
  description: "Persist the draft and return the generate response.",
  inputSchema: draftCarrierSchema,
  outputSchema: savedProposalSchema,
  execute: async ({ inputData }) => {
    const proposal = saveProposal({
      facts: inputData.facts,
      draft: inputData.draft,
      aiGenerated: inputData.aiGenerated,
      warnings: inputData.warnings,
      geminiAvailable: inputData.geminiAvailable,
      apiAvailable: true,
      draftModel: inputData.draftModel,
    });
    return {
      proposal,
      stepTrace: [
        "validate-ids",
        "load-evidence",
        "collect-route-metrics",
        "generate-draft",
        "check-draft",
        "return-proposal",
      ],
    };
  },
});

export const proposalWorkflow = createWorkflow({
  id: "morrow-proposal",
  description:
    "Validate ids → load evidence → collect route metrics → generate → check → return.",
  inputSchema: idsSchema,
  outputSchema: savedProposalSchema,
})
  .then(validateIds)
  .then(loadEvidence)
  .then(collectRouteMetrics)
  .then(generateDraft)
  .then(checkDraft)
  .then(returnProposal)
  .commit();

export function mastraConfigured(): boolean {
  return true;
}

/** Run the Mastra proposal workflow and return the saved proposal + step trace. */
export async function runProposalWorkflow(input: GenerateRequest): Promise<ProposalWorkflowResult> {
  const run = await proposalWorkflow.createRun();
  const result = await run.start({ inputData: input });

  if (result.status !== "success") {
    const message =
      result.status === "failed"
        ? result.error?.message ?? "Mastra proposal workflow failed"
        : `Mastra proposal workflow ended with status: ${result.status}`;
    const err = new Error(message);
    (err as Error & { status?: number }).status =
      /Unknown|does not|must include/i.test(message) ? 400 : 500;
    throw err;
  }

  const output = result.result;
  if (!output?.proposal) {
    throw new Error("Mastra proposal workflow returned no proposal");
  }

  return {
    proposal: output.proposal,
    stepTrace: output.stepTrace,
    mastra: true,
  };
}
