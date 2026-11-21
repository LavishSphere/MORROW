/**
 * In-memory proposal store for the hackathon demo.
 * Tiger Data persistence is deferred (WHA-9).
 */

import { randomUUID } from "node:crypto";
import type { GenerateProposalResponse } from "../../../../shared/types.ts";

const store = new Map<string, GenerateProposalResponse>();

export function saveProposal(
  record: Omit<GenerateProposalResponse, "proposalId"> & {
    proposalId?: string;
  },
): GenerateProposalResponse {
  const proposalId = record.proposalId ?? randomUUID();
  const saved: GenerateProposalResponse = { ...record, proposalId };
  store.set(proposalId, saved);
  return saved;
}

export function getProposal(
  id: string,
): GenerateProposalResponse | undefined {
  return store.get(id);
}

/** Test helper — clear saved drafts between cases. */
export function clearProposals(): void {
  store.clear();
}
