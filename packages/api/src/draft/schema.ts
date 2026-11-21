import { z } from "zod";
import type { DraftProposal } from "../../../../shared/types.ts";

export const draftProposalSchema = z.object({
  headline: z.string().min(1).max(240),
  plainLanguageSummary: z.string().min(1).max(4000),
  requestForReview: z.string().min(1).max(2000),
  meetingTalkingPoints: z.array(z.string().min(1).max(500)).min(1).max(8),
  limitations: z.string().min(1).max(4000),
});

/** Gemini structured output (plan §8D) before mapping to DraftProposal. */
export const geminiProposalDraftSchema = z.object({
  headline: z.string().min(1).max(240),
  residentSummary: z.string().min(1).max(4000),
  rationale: z.string().min(1).max(2000),
  municipalReviewRequest: z.string().min(1).max(2000),
  meetingTalkingPoints: z.array(z.string().min(1).max(500)).min(1).max(8),
  limitations: z.string().min(1).max(4000),
});

export type GeminiProposalDraft = z.infer<typeof geminiProposalDraftSchema>;

export function mapGeminiToDraft(raw: GeminiProposalDraft): DraftProposal {
  const summary = `${raw.residentSummary.trim()} ${raw.rationale.trim()}`.trim();
  return {
    headline: raw.headline.trim(),
    plainLanguageSummary: summary,
    requestForReview: raw.municipalReviewRequest.trim(),
    meetingTalkingPoints: raw.meetingTalkingPoints.map((p) => p.trim()),
    limitations: raw.limitations.trim(),
  };
}

export function parseDraftProposal(value: unknown): DraftProposal {
  return draftProposalSchema.parse(value);
}

export const generateRequestSchema = z.object({
  scenarioId: z.string().min(1).max(120),
  barrierId: z.string().min(1).max(120),
  interventionId: z.string().min(1).max(120),
});

export const proposalFactsSchema = z.object({
  city: z.string(),
  locationLabel: z.string(),
  evidenceStatus: z.enum(["verified", "community_reported", "illustrative"]),
  evidenceSources: z.array(
    z.object({
      title: z.string(),
      url: z.string().optional(),
      observedAt: z.string().optional(),
    }),
  ),
  barrierType: z.string(),
  intervention: z.string(),
  beforeMeters: z.number().nullable(),
  afterMeters: z.number().nullable(),
  newlyReachableDestinations: z.number().nullable(),
  modelAssumptions: z.array(z.string()),
  originLabel: z.string(),
  destinationLabel: z.string(),
  nextSteps: z.string(),
});
