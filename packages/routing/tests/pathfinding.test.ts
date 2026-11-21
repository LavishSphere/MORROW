import { describe, expect, it } from "vitest";
import { applyGraphChanges, sumEdgeLengths } from "../src/graph.js";
import { findShortestPath } from "../src/pathfinding.js";
import {
  SYNTHETIC_BLOCKED_EDGE_ID,
  syntheticDemoScenario,
} from "../src/fixtures/synthetic-demo.js";

describe("findShortestPath", () => {
  it("routes around an inaccessible edge for wheelchair queries", () => {
    const result = findShortestPath(syntheticDemoScenario.graph, {
      originId: "home",
      destinationId: "library",
      requireWheelchairAccessible: true,
    });

    expect(result.found).toBe(true);
    if (!result.found) return;

    expect(result.edgeIds).not.toContain(SYNTHETIC_BLOCKED_EDGE_ID);
    expect(result.distanceMeters).toBe(
      sumEdgeLengths(syntheticDemoScenario.graph, result.edgeIds),
    );
    expect(result.geometry).toHaveLength(result.nodeIds.length);
  });

  it("uses the short edge when accessibility is not required", () => {
    const result = findShortestPath(syntheticDemoScenario.graph, {
      originId: "home",
      destinationId: "library",
      requireWheelchairAccessible: false,
    });

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.edgeIds).toEqual([SYNTHETIC_BLOCKED_EDGE_ID]);
    expect(result.distanceMeters).toBe(40);
  });

  it("returns not-found when no accessible path exists", () => {
    const isolated = {
      nodes: [
        { id: "a", coordinates: [0, 0] as const },
        { id: "b", coordinates: [1, 0] as const },
      ],
      edges: [
        {
          id: "blocked",
          from: "a",
          to: "b",
          lengthMeters: 10,
          wheelchairAccessible: false,
        },
      ],
    };

    const result = findShortestPath(isolated, {
      originId: "a",
      destinationId: "b",
      requireWheelchairAccessible: true,
    });

    expect(result.found).toBe(false);
    expect(result.distanceMeters).toBeNull();
  });

  it("respects graphChanges that open a blocked edge", () => {
    const opened = applyGraphChanges(
      syntheticDemoScenario.graph,
      syntheticDemoScenario.graphChanges,
    );
    const result = findShortestPath(opened, {
      originId: "home",
      destinationId: "library",
      requireWheelchairAccessible: true,
    });

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.edgeIds).toEqual([SYNTHETIC_BLOCKED_EDGE_ID]);
    expect(result.distanceMeters).toBe(40);
  });
});
