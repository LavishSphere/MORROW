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

/** Always tried first. GEMINI_MODEL, when set to something else, comes second. */
export const PRIMARY_MODEL = "gemini-3.8-flash";
/** Known Flash models, used when the live model list cannot be read. */
const FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || PRIMARY_MODEL;
}

/**
 * Gemini models worth trying for a text draft, from the API's own list.
 * Embedding, image, audio, live, and TTS models are left out.
 */
export function draftableModels(
  listed: readonly { name?: string; supportedActions?: string[] }[],
): string[] {
  const ids = listed.flatMap((model) => {
    const id = (model.name ?? "").replace(/^models\//, "");
    if (!/^gemini-\d/.test(id)) return [];
    if (/embed|image|imagen|tts|audio|live|vision|aqa|robotics|computer-use|native/i.test(id)) return [];
    if (model.supportedActions && !model.supportedActions.includes("generateContent")) return [];
    return [id];
  });
  const version = (id: string) => Number.parseFloat(/^gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? "0");
  // Newest first. Within a version: Flash, then Flash-Lite, then Pro; stable before preview.
  const family = (id: string) => (/flash-lite/.test(id) ? 1 : /flash/.test(id) ? 0 : /pro/.test(id) ? 2 : 3);
  const preview = (id: string) => (/preview|exp/.test(id) ? 1 : 0);
  return [...new Set(ids)].sort(
    (a, b) => version(b) - version(a) || family(a) - family(b) || preview(a) - preview(b) || a.localeCompare(b),
  );
}

/**
 * The order models are tried: gemini-3.8-flash first, then GEMINI_MODEL if
 * different, then every other draftable model the key can see (newest
 * first), then the known Flash list. Each appears once.
 */
export function modelCandidates(preferred = geminiModel(), available: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const ordered = [PRIMARY_MODEL, preferred, ...available, ...FALLBACK_MODELS];
  return ordered.filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

let listedModels: { at: number; ids: string[] } | null = null;
const LIST_TTL_MS = 10 * 60_000;

/** The key's live model list, cached for ten minutes. Empty when it cannot be read. */
async function availableModels(ai: GoogleGenAI): Promise<string[]> {
  if (listedModels && Date.now() - listedModels.at < LIST_TTL_MS) return listedModels.ids;
  try {
    const listed: { name?: string; supportedActions?: string[] }[] = [];
    const pager = await withTimeout(ai.models.list({ config: { pageSize: 200 } }), 4_000);
    for await (const model of pager) listed.push(model);
    listedModels = { at: Date.now(), ids: draftableModels(listed) };
  } catch (err) {
    console.error("[@morrow/api] Gemini model list unavailable:", err instanceof Error ? err.message : err);
    listedModels = { at: Date.now() - LIST_TTL_MS + 60_000, ids: [] };
  }
  return listedModels.ids;
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

/** Give up on one model after this long and try the next. */
const CALL_TIMEOUT_MS = 12_000;
/**
 * The whole search stops here, so the reply reaches the browser before the
 * 60 s proxy limit and the browser's 55 s wait. A busy model usually answers
 * "high demand" in about a second, so many models fit in this window.
 */
const TOTAL_BUDGET_MS = 48_000;
/** Not worth starting another model with less time left than this. */
const MIN_CALL_MS = 4_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Gemini timed out after ${ms} ms`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

export type GeminiDraftResult =
  | { ok: true; draft: DraftProposal; model: string; tried: string[] }
  | { ok: false; reason: string; tried: string[] };

type DraftAttempt = { ok: true; draft: DraftProposal } | { ok: false; reason: string };

/** Capacity, timeouts, and bad drafts move on. A rejected key stops, because every model would fail the same way. */
export function shouldTryNextModel(reason: string): boolean {
  if (
    /401|403|PERMISSION_DENIED|API_KEY_INVALID|API key not valid|unregistered callers/i.test(
      reason,
    )
  ) {
    return false;
  }
  return /500|502|503|504|404|429|INTERNAL|UNAVAILABLE|NOT_FOUND|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|overloaded|high demand|no longer available|not supported|does not support|timed out|fetch failed|ECONNRESET|Empty Gemini response|Gemini returned non-JSON|Gemini draft failed validation/i.test(
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
  ai: GoogleGenAI,
  facts: ProposalFacts,
  model: string,
  timeoutMs: number,
): Promise<DraftAttempt> {
  try {
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
      timeoutMs,
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
    return { ok: false, reason: "GEMINI_API_KEY not set", tried: [] };
  }

  const started = Date.now();
  const ai = new GoogleGenAI({ apiKey });
  const tried: string[] = [];
  let last: DraftAttempt = { ok: false, reason: "Gemini call failed" };

  // gemini-3.8-flash goes first without waiting for the model list.
  const first = await requestDraft(ai, facts, PRIMARY_MODEL, CALL_TIMEOUT_MS);
  tried.push(PRIMARY_MODEL);
  if (first.ok) return { ...first, model: PRIMARY_MODEL, tried };
  last = first;
  console.error(`[@morrow/api] Gemini ${PRIMARY_MODEL} skipped:`, first.reason);
  if (!shouldTryNextModel(first.reason)) return { ...first, tried };

  for (const model of modelCandidates(geminiModel(), await availableModels(ai))) {
    if (tried.includes(model)) continue;
    const left = TOTAL_BUDGET_MS - (Date.now() - started);
    if (left < MIN_CALL_MS) {
      last = { ok: false, reason: `${last.ok ? "" : last.reason}; stopped after ${tried.length} models (time limit)` };
      break;
    }
    const result = await requestDraft(ai, facts, model, Math.min(CALL_TIMEOUT_MS, left));
    tried.push(model);
    if (result.ok) {
      console.info(`[@morrow/api] Gemini draft from ${model} after ${tried.length} tries`);
      return { ...result, model, tried };
    }
    last = result;
    console.error(`[@morrow/api] Gemini ${model} skipped:`, result.reason);
    if (!shouldTryNextModel(result.reason)) break;
  }
  return { ...(last as { ok: false; reason: string }), tried };
}
