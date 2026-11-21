/**
 * Optional Gemini drafting. Without GEMINI_API_KEY the caller uses the template.
 * Keys stay server-side — never sent to the browser.
 */

import { GoogleGenAI } from "@google/genai";
import type { DraftProposal, ProposalFacts } from "../../../../shared/types.ts";
import {
  geminiProposalDraftSchema,
  mapGeminiToDraft,
  type GeminiProposalDraft,
} from "./schema.ts";

const DEFAULT_MODEL = "gemini-2.0-flash";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

const PROMPT_CONTRACT = `Write an editable community advocacy proposal using ONLY the supplied facts.
State that results are modeled, retain the evidence status, and ask officials to assess feasibility.
Do not invent real accessibility defects, agency names, source links, cost estimates, construction timelines, or outcome figures.
Return only the requested JSON fields.`;

function buildUserPayload(facts: ProposalFacts): string {
  return JSON.stringify(
    {
      city: facts.city,
      locationLabel: facts.locationLabel,
      evidenceStatus: facts.evidenceStatus,
      sources: facts.evidenceSources,
      barrierType: facts.barrierType,
      intervention: facts.intervention,
      originLabel: facts.originLabel,
      destinationLabel: facts.destinationLabel,
      modeledRoute: {
        beforeMeters: facts.beforeMeters,
        afterMeters: facts.afterMeters,
        unit: "meters",
      },
      newlyReachableDestinations: facts.newlyReachableDestinations,
      assumptions: facts.modelAssumptions,
    },
    null,
    2,
  );
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    residentSummary: { type: "string" },
    rationale: { type: "string" },
    municipalReviewRequest: { type: "string" },
    meetingTalkingPoints: {
      type: "array",
      items: { type: "string" },
    },
    limitations: { type: "string" },
  },
  required: [
    "headline",
    "residentSummary",
    "rationale",
    "municipalReviewRequest",
    "meetingTalkingPoints",
    "limitations",
  ],
} as const;

export type GeminiDraftResult =
  | { ok: true; draft: DraftProposal }
  | { ok: false; reason: string };

export async function draftWithGemini(
  facts: ProposalFacts,
): Promise<GeminiDraftResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "GEMINI_API_KEY not set" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: geminiModel(),
      contents: `${PROMPT_CONTRACT}\n\nFacts:\n${buildUserPayload(facts)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    });

    const text = response.text;
    if (!text) {
      return { ok: false, reason: "Empty Gemini response" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, reason: "Gemini returned non-JSON" };
    }

    const validated: GeminiProposalDraft = geminiProposalDraftSchema.parse(parsed);
    return { ok: true, draft: mapGeminiToDraft(validated) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gemini call failed";
    return { ok: false, reason: message };
  }
}
