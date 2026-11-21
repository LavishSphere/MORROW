/**
 * Assemble trusted ProposalFacts: reload canonical records, recompute meters
 * via @morrow/routing. Never trust client-supplied distances or evidence labels.
 */

import { compareScenario } from "@morrow/routing";
import type {
  Barrier,
  Intervention,
  ProposalFacts,
} from "../../../shared/types.ts";
import {
  basemapGeoJSON,
  getBarrier,
  getIntervention,
  getScenario,
  scenario as demoScenario,
} from "./data/dataset.ts";

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
  scenarioId: string;
  barrier: Barrier;
  intervention: Intervention;
  facts: ProposalFacts;
};

export function resolveGenerateInput(body: {
  scenarioId: string;
  barrierId: string;
  interventionId: string;
}): ResolvedGenerateInput {
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

  // Canonical graphChanges from the bundled intervention — ignore any client meters.
  const comparison = compareScenario(basemapGeoJSON, {
    origin: scenario.origin,
    destination: scenario.destination,
    graphChanges: intervention.graphChanges,
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
