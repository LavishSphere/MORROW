import { describe, expect, it } from "vitest";
import {
  compareBeforeAfter,
  compareScenario,
  toModeledRouteMetrics,
} from "../src/compare.js";
import { applyGraphChanges, sumEdgeLengths } from "../src/graph.js";
import {
  SYNTHETIC_BLOCKED_EDGE_ID,
  SYNTHETIC_EXPECTED,
  syntheticDemoScenario,
} from "../src/fixtures/synthetic-demo.js";
import { DEFAULT_MODEL_ASSUMPTIONS } from "../src/assumptions.js";

/**
 * Plan requirement: tests fail if before/after figures are hard-coded constants.
 * We prove distances are recomputed from the live graph each time.
 */
describe("before/after modeled comparison", () => {
  it("recomputes a shorter accessible path after the ramp intervention", () => {
    const comparison = compareScenario(syntheticDemoScenario);

    expect(comparison.before.found).toBe(true);
    expect(comparison.after.found).toBe(true);
    if (!comparison.before.found || !comparison.after.found) return;

    expect(comparison.before.distanceMeters).toBe(
      SYNTHETIC_EXPECTED.beforeMeters,
    );
    expect(comparison.after.distanceMeters).toBe(
      SYNTHETIC_EXPECTED.afterMeters,
    );
    expect(comparison.deltaMeters).toBe(
      SYNTHETIC_EXPECTED.afterMeters - SYNTHETIC_EXPECTED.beforeMeters,
    );
    expect(comparison.after.distanceMeters).toBeLessThan(
      comparison.before.distanceMeters,
    );
  });

  it("ties reported meters to the sum of traversed edge lengths (not magic numbers)", () => {
    const comparison = compareScenario(syntheticDemoScenario);
    expect(comparison.before.found && comparison.after.found).toBe(true);
    if (!comparison.before.found || !comparison.after.found) return;

    const beforeSum = sumEdgeLengths(
      syntheticDemoScenario.graph,
      comparison.before.edgeIds,
    );
    const afterGraph = applyGraphChanges(
      syntheticDemoScenario.graph,
      syntheticDemoScenario.graphChanges,
    );
    const afterSum = sumEdgeLengths(afterGraph, comparison.after.edgeIds);

    expect(comparison.before.distanceMeters).toBe(beforeSum);
    expect(comparison.after.distanceMeters).toBe(afterSum);
  });

  it("changes afterMeters when an edge weight in graphChanges changes", () => {
    const baseline = compareScenario(syntheticDemoScenario);
    expect(baseline.after.found).toBe(true);
    if (!baseline.after.found) return;

    const heavier = compareBeforeAfter({
      scenarioId: syntheticDemoScenario.id,
      interventionId: "synthetic-install-ramp-heavier",
      graph: syntheticDemoScenario.graph,
      query: {
        originId: syntheticDemoScenario.originId,
        destinationId: syntheticDemoScenario.destinationId,
        requireWheelchairAccessible: true,
      },
      graphChanges: [
        {
          edgeId: SYNTHETIC_BLOCKED_EDGE_ID,
          accessible: true,
          weight: 55,
        },
      ],
    });

    expect(heavier.after.found).toBe(true);
    if (!heavier.after.found) return;

    expect(heavier.after.distanceMeters).toBe(55);
    expect(heavier.after.distanceMeters).not.toBe(
      baseline.after.distanceMeters,
    );
    // Hard-coded UI constants from the project-plan API sketch must not appear.
    expect(heavier.after.distanceMeters).not.toBe(410);
    expect(baseline.before.distanceMeters).not.toBe(620);
  });

  it("returns identical before/after when graphChanges is empty", () => {
    const comparison = compareBeforeAfter({
      scenarioId: "noop",
      interventionId: "none",
      graph: syntheticDemoScenario.graph,
      query: {
        originId: "home",
        destinationId: "library",
        requireWheelchairAccessible: true,
      },
      graphChanges: [],
    });

    expect(comparison.before).toEqual(comparison.after);
    expect(comparison.deltaMeters).toBe(0);
  });

  it("ships model assumptions with metrics for proposals", () => {
    const comparison = compareScenario(syntheticDemoScenario);
    const metrics = toModeledRouteMetrics(comparison);

    expect(metrics.unit).toBe("meters");
    expect(metrics.beforeMeters).toBe(comparison.before.found
      ? comparison.before.distanceMeters
      : null);
    expect(metrics.afterMeters).toBe(comparison.after.found
      ? comparison.after.distanceMeters
      : null);
    for (const line of DEFAULT_MODEL_ASSUMPTIONS) {
      expect(metrics.modelAssumptions).toContain(line);
    }
    expect(metrics.modelAssumptions).toContain(
      "Synthetic fixture graph for unit tests — not Wellesley geography.",
    );
  });

  it("rejects graphChanges that target unknown edges", () => {
    expect(() =>
      compareBeforeAfter({
        scenarioId: "bad",
        interventionId: "bad",
        graph: syntheticDemoScenario.graph,
        query: {
          originId: "home",
          destinationId: "library",
        },
        graphChanges: [{ edgeId: "does-not-exist", accessible: true }],
      }),
    ).toThrow(/unknown edgeId/i);
  });
});
