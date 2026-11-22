import type { DraftProposal, ProposalFacts } from "../../../../shared/types.ts";

/** Deterministic draft when Gemini is unavailable or rejects validation. */
export function buildTemplateDraft(facts: ProposalFacts): DraftProposal {
  const before =
    facts.beforeMeters == null || !Number.isFinite(facts.beforeMeters)
      ? "Unreachable"
      : `${Math.round(facts.beforeMeters).toLocaleString("en-US")} m`;
  const after =
    facts.afterMeters == null || !Number.isFinite(facts.afterMeters)
      ? "Unreachable"
      : `${Math.round(facts.afterMeters).toLocaleString("en-US")} m`;
  const evidenceLabel = facts.evidenceStatus.replaceAll("_", " ");

  return {
    headline: `Review a modeled accessibility improvement near ${facts.locationLabel}`,
    plainLanguageSummary: `This draft proposes reviewing a potential pedestrian accessibility improvement in ${facts.city} at ${facts.locationLabel}. The evidence status is ${evidenceLabel}. MORROW's demonstration model compares an accessible trip from ${facts.originLabel} to ${facts.destinationLabel}: ${before} before the suggested change and ${after} after “${facts.intervention}”. These results are modeled, not measured.`,
    requestForReview:
      "Please assess this location on site and evaluate whether an accessible improvement is feasible. This document is a community conversation aid, not an engineering or construction recommendation.",
    meetingTalkingPoints: [
      `Location: ${facts.locationLabel} (${facts.city}).`,
      `Evidence status: ${evidenceLabel}. Treat illustrative records as simulation, not a verified defect.`,
      `Suggested change: ${facts.intervention}.`,
      `Modeled accessible route: ${before} before → ${after} after.`,
      "Request an on-site assessment; do not infer approval, feasibility, cost, or construction timing.",
    ],
    limitations: [
      "Modeled impact only; no site inspection or engineering feasibility assessment.",
      ...facts.modelAssumptions,
      "Do not treat this draft as verified municipal findings or cost estimates.",
    ].join(" "),
  };
}

export function reconcileGeneratedDraft(
  generated: DraftProposal,
  facts: ProposalFacts,
): DraftProposal {
  const template = buildTemplateDraft(facts);
  const headline = generated.headline.trim();
  const request = generated.requestForReview.trim();

  return {
    ...template,
    headline: headline || template.headline,
    requestForReview:
      request && !/cost|deadline|agency|department|approval/i.test(request)
        ? request
        : template.requestForReview,
  };
}
