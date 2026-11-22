/**
 * Optional fallback: when no Gemini model gives a draft, ask Gemini models
 * through OpenRouter before falling back to the template. Only used when
 * OPENROUTER_API_KEY is set; remove the key and this step is skipped.
 * The key stays server-side.
 */

import type { DraftProposal, ProposalFacts } from "../../../../shared/types.ts";
import {
  PROMPT_CONTRACT,
  RESPONSE_SCHEMA,
  buildUserPayload,
  failureKind,
  openRouterConfigured,
  parseModelJson,
} from "./gemini.ts";
import { geminiProposalDraftSchema, mapGeminiToDraft } from "./schema.ts";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Gemini 3 on OpenRouter, best first; OpenRouter moves down the list when a
 * model is busy (per million tokens in/out, Nov 2026): 3.8 Flash $0.83/$4.13,
 * 3.6 Flash $0.75/$3.75, 3.5 Flash-Lite $0.30/$2.50. Older 2.5 and 3.1 models
 * are left out: they write weaker drafts, and 3.1 is on the free Gemini tier.
 * A draft is about 2k tokens in and under 4k out: about two cents at most.
 * OPENROUTER_MODELS (comma-separated) replaces this list.
 */
export const OPENROUTER_DEFAULT_MODELS = [
  "google/gemini-3.8-flash",
  "google/gemini-3.6-flash",
  "google/gemini-3.5-flash-lite",
] as const;

export function openRouterModels(): string[] {
  const listed = (process.env.OPENROUTER_MODELS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return listed.length ? listed : [...OPENROUTER_DEFAULT_MODELS];
}

export type OpenRouterResult =
  | { ok: true; draft: DraftProposal; model: string }
  | { ok: false; reason: string };

export async function draftWithOpenRouter(facts: ProposalFacts, timeoutMs: number): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || !openRouterConfigured()) return { ok: false, reason: "OPENROUTER_API_KEY not set" };
  if (timeoutMs < 3_000) return { ok: false, reason: "no time left for OpenRouter" };
  const [model, ...rest] = openRouterModels();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-title": "MORROW",
      },
      body: JSON.stringify({
        model,
        // OpenRouter tries these in order when the first is busy or down.
        ...(rest.length ? { models: [model, ...rest] } : {}),
        messages: [
          { role: "system", content: PROMPT_CONTRACT },
          { role: "user", content: `Facts:\n${buildUserPayload(facts)}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "proposal_draft", strict: true, schema: { ...RESPONSE_SCHEMA, additionalProperties: false } },
        },
        // Gemini 3 thinks by default; thinking tokens are billed and count
        // against max_tokens, so keep it low.
        reasoning: { effort: "low" },
        temperature: 0.4,
        // Caps the bill per draft; a proposal plus low thinking fits.
        max_tokens: 4096,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, reason: `OpenRouter ${res.status}: ${detail}` };
    }
    const body = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const parsed = parseModelJson(text);
    if (parsed === undefined) return { ok: false, reason: "OpenRouter returned non-JSON" };
    const draft = mapGeminiToDraft(geminiProposalDraftSchema.parse(parsed));
    return { ok: true, draft, model: body.model ?? model ?? "openrouter" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenRouter call failed";
    return { ok: false, reason: /abort|timeout/i.test(message) ? "OpenRouter timed out" : message };
  }
}

export { failureKind };
