/**
 * Assemble trusted ProposalFacts: reload canonical records, recompute meters
 * via @morrow/routing. Never trust client-supplied distances or evidence labels.
 */

import { compareScenario } from "@morrow/routing";
import { detectIssues, issueFact, issuesOnlyFacts, type MapIssue } from "../../../shared/issues.ts";
import type {
  Barrier,
  Intervention,
  IssueFact,
  ProposalFacts,
} from "../../../shared/types.ts";
import {
  basemapGeoJSON,
  getBarrier,
  getIntervention,
  getScenario,
  graphChangesForIntervention,
  scenario as demoScenario,
  townGeoJSON,
} from "./data/dataset.ts";
import type { z } from "zod";
import type { browserIssueSchema } from "./draft/schema.ts";

type BrowserIssue = z.infer<typeof browserIssueSchema>;

const DEFAULT_NEXT_STEPS =
  "Share this draft with neighbors or local advocates. Do not invent a specific department submission link without verification.";

export class ProposalInputError extends Error {
  override name = "ProposalInputError";
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ResolvedGenerateInput = {
  /** Null for an issues-only proposal. */
  scenarioId: string | null;
  barrier: Barrier | null;
  intervention: Intervention | null;
  facts: ProposalFacts;
};

let townIssues: Map<string, MapIssue> | null = null;

/**
 * Rebuild trusted facts for extra issues from ids alone: re-detect them in
 * the bundled town map and recompute what fixing them changes.
 */
export function resolveIssues(ids: readonly string[] | undefined): IssueFact[] {
  if (!ids || ids.length === 0) return [];
  townIssues ??= new Map(detectIssues(townGeoJSON()).map((issue) => [issue.id, issue]));
  const known = townIssues;
  return [...new Set(ids)].map((id) => {
    const issue = known.get(id);
    if (!issue) throw new ProposalInputError(`Unknown issueId: ${id}`, 400);
    return issueFact(issue, townGeoJSON());
  });
}

/** Browser-measured issues: evidence and source are set here, not by the client. */
export function browserIssueFacts(issues: readonly BrowserIssue[]): IssueFact[] {
  return issues.map((issue) => ({
    ...issue,
    evidenceStatus: "community_reported" as const,
    source: "OpenStreetMap contributors",
    sourceUrl: "https://www.openstreetmap.org/copyright",
  }));
}

const BROWSER_ISSUES_NOTE =
  "These issues were measured from OpenStreetMap in the visitor's browser; the server did not re-check them.";

export function resolveGenerateInput(body: {
  scenarioId?: string;
  barrierId?: string;
  interventionId?: string;
  issueIds?: string[];
  browserIssues?: BrowserIssue[];
  city?: string;
}): ResolvedGenerateInput {
  if (!body.scenarioId || !body.barrierId || !body.interventionId) {
    // A loaded city the server has no map of: use the browser's measurements.
    if (!body.issueIds?.length && body.browserIssues?.length) {
      const facts = issuesOnlyFacts(browserIssueFacts(body.browserIssues), body.city ?? "this city");
      facts.modelAssumptions = [...facts.modelAssumptions, BROWSER_ISSUES_NOTE];
      return { scenarioId: null, barrier: null, intervention: null, facts };
    }
    // Issues only: the resident's picked map issues are the whole proposal.
    const issues = resolveIssues(body.issueIds);
    if (issues.length === 0) {
      throw new ProposalInputError("Pick at least one issue, or send the showcase scenario ids.", 400);
    }
    return {
      scenarioId: null,
      barrier: null,
      intervention: null,
      facts: issuesOnlyFacts(issues, "Wellesley, MA"),
    };
  }
  const scenario = getScenario(body.scenarioId);
  if (!scenario) {
    throw new ProposalInputError(
      `Unknown scenarioId: ${body.scenarioId}`,
      400,
    );
  }

  const barrier = getBarrier(body.barrierId);
  if (!barrier) {
    throw new ProposalInputError(`Unknown barrierId: ${body.barrierId}`, 400);
  }

  const intervention = getIntervention(body.interventionId);
  if (!intervention) {
    throw new ProposalInputError(
      `Unknown interventionId: ${body.interventionId}`,
      400,
    );
  }

  if (intervention.barrierId !== barrier.id) {
    throw new ProposalInputError(
      "interventionId does not belong to barrierId",
      400,
    );
  }

  if (scenario.barrierId !== barrier.id) {
    throw new ProposalInputError(
      "barrierId does not match the scenario's barrier",
      400,
    );
  }

  if (scenario.interventionId !== intervention.id) {
    throw new ProposalInputError(
      "interventionId does not match the scenario's intervention",
      400,
    );
  }

  const graphChanges = graphChangesForIntervention(intervention.id);
  if (graphChanges.length === 0) {
    throw new ProposalInputError(
      "intervention graphChanges is empty — cannot compare the demo trip",
      500,
    );
  }

  // Canonical graphChanges from the bundled intervention — ignore any client meters.
  const comparison = compareScenario(basemapGeoJSON, {
    origin: scenario.origin,
    destination: scenario.destination,
    graphChanges,
  });

  const evidenceSources =
    barrier.sourceTitle || barrier.source
      ? [
          {
            title: barrier.sourceTitle ?? barrier.source ?? "Source",
            ...(barrier.sourceUrl ? { url: barrier.sourceUrl } : {}),
            ...(barrier.observedAt ? { observedAt: barrier.observedAt } : {}),
          },
        ]
      : [];

  const facts: ProposalFacts = {
    city: scenario.city,
    locationLabel: barrier.locationLabel ?? scenario.label,
    evidenceStatus: barrier.evidenceStatus,
    evidenceSources,
    barrierType: barrier.type,
    intervention: intervention.description,
    beforeMeters: comparison.beforeMeters,
    afterMeters: comparison.afterMeters,
    newlyReachableDestinations: comparison.becameReachable ? 1 : null,
    modelAssumptions:
      scenario.assumptions.length > 0
        ? [...scenario.assumptions]
        : [...comparison.assumptions],
    originLabel: scenario.originLabel,
    destinationLabel: scenario.destinationLabel,
    nextSteps: DEFAULT_NEXT_STEPS,
  };
  const issues = resolveIssues(body.issueIds);
  if (issues.length > 0) facts.issues = issues;

  return {
    scenarioId: scenario.id,
    barrier,
    intervention,
    facts,
  };
}

export function demoScenarioId(): string {
  return demoScenario.id;
}
