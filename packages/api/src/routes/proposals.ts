import type { IncomingMessage, ServerResponse } from "node:http";
import { getProposal } from "../data/proposals.ts";
import {
  getProposalFromTiger,
  saveProposalToTiger,
  tigerLive,
} from "../data/tiger.ts";
import { generateRequestSchema, hasSubject } from "../draft/schema.ts";
import { readJsonBody, sendJson } from "../http.ts";
import { runProposalWorkflow } from "../workflow/proposal.ts";

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
  if (!parsed.success || !hasSubject(parsed.data)) {
    sendJson(res, 400, {
      error:
        "Body must include issueIds, or scenarioId, barrierId, and interventionId (ids only).",
      ...(parsed.success ? {} : { details: parsed.error.flatten() }),
    });
    return;
  }

  try {
    const { proposal, stepTrace, mastra } = await runProposalWorkflow(
      parsed.data,
    );
    const persisted = await saveProposalToTiger(proposal);
    if (tigerLive() && !persisted) {
      proposal.warnings = [
        ...proposal.warnings,
        "Tiger Data proposal save failed — draft kept in memory for this session.",
      ];
    }
    sendJson(res, 201, {
      ...proposal,
      mastra,
      workflowSteps: stepTrace,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generate failed";
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : /Unknown|does not match|does not belong/i.test(message)
          ? 400
          : 500;
    sendJson(res, status, { error: message });
  }
}

export async function handleGetProposal(
  _req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  const memory = getProposal(id);
  if (memory) {
    sendJson(res, 200, memory);
    return;
  }

  const fromTiger = await getProposalFromTiger(id);
  if (fromTiger) {
    sendJson(res, 200, fromTiger);
    return;
  }

  sendJson(res, 404, { error: `Proposal not found: ${id}` });
}
