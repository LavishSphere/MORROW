import type { IncomingMessage, ServerResponse } from "node:http";
import type { DraftProposal } from "../../../../shared/types.ts";
import { getProposal, saveProposal } from "../data/proposals.ts";
import { draftWithGemini, geminiConfigured } from "../draft/gemini.ts";
import { generateRequestSchema, parseDraftProposal } from "../draft/schema.ts";
import { buildTemplateDraft } from "../draft/template.ts";
import { ProposalInputError, resolveGenerateInput } from "../facts.ts";
import { readJsonBody, sendJson } from "../http.ts";

export async function handleGenerateProposal(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 400;
    sendJson(res, status, {
      error: err instanceof Error ? err.message : "Bad request body",
    });
    return;
  }

  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, {
      error: "Body must include scenarioId, barrierId, and interventionId (ids only).",
      details: parsed.error.flatten(),
    });
    return;
  }

  let resolved;
  try {
    resolved = resolveGenerateInput(parsed.data);
  } catch (err) {
    if (err instanceof ProposalInputError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    throw err;
  }

  const warnings: string[] = [];
  const keyPresent = geminiConfigured();
  let draft: DraftProposal;
  let aiGenerated = false;

  if (keyPresent) {
    const gemini = await draftWithGemini(resolved.facts);
    if (gemini.ok) {
      try {
        draft = parseDraftProposal(gemini.draft);
        aiGenerated = true;
      } catch {
        draft = buildTemplateDraft(resolved.facts);
        warnings.push(
          "Gemini draft failed schema validation — using deterministic template.",
        );
      }
    } else {
      draft = buildTemplateDraft(resolved.facts);
      warnings.push(`Gemini unavailable (${gemini.reason}) — using deterministic template.`);
    }
  } else {
    draft = buildTemplateDraft(resolved.facts);
    warnings.push(
      "GEMINI_API_KEY not set — using deterministic template (expected for local/outage demos).",
    );
  }

  const saved = saveProposal({
    facts: resolved.facts,
    draft,
    aiGenerated,
    warnings,
    geminiAvailable: keyPresent,
    apiAvailable: true,
  });

  sendJson(res, 201, saved);
}

export function handleGetProposal(
  _req: IncomingMessage,
  res: ServerResponse,
  id: string,
): void {
  const proposal = getProposal(id);
  if (!proposal) {
    sendJson(res, 404, { error: `Proposal not found: ${id}` });
    return;
  }
  sendJson(res, 200, proposal);
}
