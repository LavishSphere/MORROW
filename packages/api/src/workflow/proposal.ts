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
import { draftWithGemini, geminiConfigured } from "../draft/gemini.ts";
import {
  draftProposalSchema,
  generateRequestSchema,
  parseDraftProposal,
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

    if (keyPresent) {
      const gemini = await draftWithGemini(inputData.facts);
      if (gemini.ok) {
        try {
          draft = parseDraftProposal(gemini.draft);
          aiGenerated = true;
        } catch {
          draft = buildTemplateDraft(inputData.facts);
          warnings.push(
            "Gemini draft failed schema validation — using deterministic template.",
          );
        }
      } else {
        draft = buildTemplateDraft(inputData.facts);
        warnings.push(
          `Gemini unavailable (${gemini.reason}) — using deterministic template.`,
        );
      }
    } else {
      draft = buildTemplateDraft(inputData.facts);
      warnings.push(
        "GEMINI_API_KEY not set — using deterministic template (expected for local/outage demos).",
      );
    }

    return {
      ...inputData,
      draft,
      aiGenerated,
      warnings,
      geminiAvailable: keyPresent,
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
export async function runProposalWorkflow(input: {
  scenarioId: string;
  barrierId: string;
  interventionId: string;
}): Promise<ProposalWorkflowResult> {
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
