import type { DraftProposal, ProposalFacts } from '../types'

/** Deterministic template when Gemini is unavailable (always, in this UI PR). */
export function buildTemplateDraft(facts: ProposalFacts): DraftProposal {
  const before =
    facts.beforeMeters == null ? 'an inaccessible detour' : `${facts.beforeMeters} m`
  const after =
    facts.afterMeters == null ? 'a shorter accessible path' : `${facts.afterMeters} m`

  return {
    headline: `Review a modeled accessibility improvement near ${facts.locationLabel}`,
    plainLanguageSummary: `This draft describes a potential pedestrian accessibility improvement in ${facts.city} at ${facts.locationLabel}. The scenario is labeled ${facts.evidenceStatus.replace('_', ' ')}. MORROW's demonstration model compares an accessible trip from ${facts.originLabel} to ${facts.destinationLabel}: about ${before} before the suggested change, and about ${after} after applying “${facts.intervention}”. Results are modeled only.`,
    requestForReview:
      'Please review this location on site and evaluate whether an accessible improvement is feasible. This document is a community conversation aid, not an engineering or construction recommendation.',
    meetingTalkingPoints: [
      `Location: ${facts.locationLabel} (${facts.city}).`,
      `Evidence status: ${facts.evidenceStatus.replaceAll('_', ' ')} — treat illustrative records as simulation.`,
      `Suggested change: ${facts.intervention}.`,
      `Modeled accessible route: ${before} → ${after}.`,
    ],
    limitations: [
      'Modeled impact only; no site inspection.',
      ...facts.modelAssumptions,
      'Do not treat this draft as verified municipal findings or cost estimates.',
    ].join(' '),
  }
}
