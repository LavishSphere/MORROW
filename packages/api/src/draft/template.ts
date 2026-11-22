import { buildIssuesDraft } from "../../../../shared/issues.ts";
import type { DraftProposal, ProposalFacts } from "../../../../shared/types.ts";

/** Deterministic draft when Gemini is unavailable or rejects validation. */
export function buildTemplateDraft(facts: ProposalFacts): DraftProposal {
  if (facts.scope === "issues") return buildIssuesDraft(facts);
  const before =
    facts.beforeMeters == null || !Number.isFinite(facts.beforeMeters)
      ? "an inaccessible detour"
      : `${Math.round(facts.beforeMeters).toLocaleString("en-US")} m`;
  const after =
    facts.afterMeters == null || !Number.isFinite(facts.afterMeters)
      ? "a shorter accessible path"
      : `${Math.round(facts.afterMeters).toLocaleString("en-US")} m`;
  const evidenceLabel = facts.evidenceStatus.replaceAll("_", " ");
  const issues = facts.issues ?? [];
  const issueSummary =
    issues.length > 0
      ? ` It also covers ${issues.length} more issue${issues.length === 1 ? "" : "s"} recorded in OpenStreetMap (community-reported, not a field survey): ${issues
          .map((issue) => `${issue.title.toLowerCase()} at ${issue.where} — ${issue.after.replace(/\.$/, "")}`)
          .join("; ")}.`
      : "";

  return {
    headline: `Review a modeled accessibility improvement near ${facts.locationLabel}${issues.length > 0 ? ` and ${issues.length} more issue${issues.length === 1 ? "" : "s"}` : ""}`,
    plainLanguageSummary: `This draft describes a potential pedestrian accessibility improvement in ${facts.city} at ${facts.locationLabel}. The scenario is labeled ${evidenceLabel}. MORROW's demonstration model compares an accessible trip from ${facts.originLabel} to ${facts.destinationLabel}: about ${before} before the suggested change, and about ${after} after applying “${facts.intervention}”. Results are modeled only.${issueSummary}`,
    requestForReview:
      "Please review this location on site and evaluate whether an accessible improvement is feasible. This document is a community conversation aid, not an engineering or construction recommendation.",
    meetingTalkingPoints: [
      `Location: ${facts.locationLabel} (${facts.city}).`,
      `Evidence status: ${evidenceLabel} — treat illustrative records as simulation.`,
      `Suggested change: ${facts.intervention}.`,
      `Modeled accessible route: ${before} → ${after}.`,
      ...issues.slice(0, 4).map((issue) => `${issue.where}: ${issue.before} Fix: ${issue.fix}`),
    ],
    limitations: [
      "Modeled impact only; no site inspection.",
      ...facts.modelAssumptions,
      "Do not treat this draft as verified municipal findings or cost estimates.",
    ].join(" "),
  };
}
