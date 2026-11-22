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

const DEFAULT_MODEL = "gemini-3.8-flash";
/** Tried in order when the preferred model is retired or at capacity. */
const FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function modelCandidates(preferred = geminiModel()): string[] {
  const seen = new Set<string>();
  const ordered = [preferred, ...FALLBACK_MODELS];
  return ordered.filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const PROMPT_CONTRACT = `Write an editable community advocacy proposal using ONLY the supplied facts.
State that results are modeled, retain the evidence status, and ask officials to assess feasibility.
Do not invent real accessibility defects, agency names, source links, cost estimates, construction timelines, or outcome figures.
If scope is "issues", there is no main route: the proposal is entirely about the additionalIssues.
If additionalIssues are supplied, the proposal covers every one of them: name where it is, what the problem is, the suggested fix, and its before/after exactly as given. Give each its own talking point when space allows.
Their evidence status "community_reported" means OpenStreetMap mapper data, not a field survey; say so once.
Return only the requested JSON fields.`;

function buildUserPayload(facts: ProposalFacts): string {
  return JSON.stringify(
    {
      scope: facts.scope ?? "scenario",
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
      additionalIssues: (facts.issues ?? []).map((issue) => ({
        title: issue.title,
        where: issue.where,
        evidenceStatus: issue.evidenceStatus,
        source: issue.source,
        suggestedFix: issue.fix,
        before: issue.before,
        after: issue.after,
        numbers: issue.metrics,
        modeled: issue.modeled,
      })),
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

/**
 * Give up on one model after this long and try the next, so a request never
 * hangs. Up to four models × 12 s stays under the 60 s proxy limit.
 */
const CALL_TIMEOUT_MS = 12_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Gemini timed out after ${ms} ms`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

export type GeminiDraftResult =
  | { ok: true; draft: DraftProposal }
  | { ok: false; reason: string };

/** Capacity, timeouts, and bad drafts move on. A rejected key stops, because every model would fail the same way. */
export function shouldTryNextModel(reason: string): boolean {
  if (
    /401|403|PERMISSION_DENIED|API_KEY_INVALID|API key not valid|unregistered callers/i.test(
      reason,
    )
  ) {
    return false;
  }
  return /503|404|429|UNAVAILABLE|NOT_FOUND|RESOURCE_EXHAUSTED|high demand|no longer available|timed out|Empty Gemini response|Gemini returned non-JSON|Gemini draft failed validation/i.test(
    reason,
  );
}

function parseModelJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // The next candidate may be the object buried in prose.
    }
  }
  return undefined;
}

async function requestDraft(
  apiKey: string,
  facts: ProposalFacts,
  model: string,
): Promise<GeminiDraftResult> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: `${PROMPT_CONTRACT}

Facts:
${buildUserPayload(facts)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
          // Room for several extra issues in one proposal.
          maxOutputTokens: 2048,
        },
      }),
      CALL_TIMEOUT_MS,
    );

    const text = response.text;
    if (!text?.trim()) {
      return { ok: false, reason: "Empty Gemini response" };
    }

    const parsed = parseModelJson(text);
    if (parsed === undefined) {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
      return { ok: false, reason: `Gemini returned non-JSON: ${snippet}` };
    }

    const validated: GeminiProposalDraft = geminiProposalDraftSchema.parse(parsed);
    return { ok: true, draft: mapGeminiToDraft(validated) };
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return { ok: false, reason: `Gemini draft failed validation: ${err.message}` };
    }
    const message = err instanceof Error ? err.message : "Gemini call failed";
    return { ok: false, reason: message };
  }
}

export async function draftWithGemini(
  facts: ProposalFacts,
): Promise<GeminiDraftResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "GEMINI_API_KEY not set" };
  }

  let last: GeminiDraftResult = { ok: false, reason: "Gemini call failed" };
  for (const model of modelCandidates()) {
    const result = await requestDraft(apiKey, facts, model);
    if (result.ok) return result;
    last = result;
    console.error(`[@morrow/api] Gemini ${model} skipped:`, result.reason);
    if (!shouldTryNextModel(result.reason)) return result;
  }
  return last;
}
