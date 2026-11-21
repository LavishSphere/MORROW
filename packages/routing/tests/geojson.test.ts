import { describe, expect, it } from "vitest";
import { graphFromWalkableGeoJson } from "../src/geojson.js";
import { findShortestPath } from "../src/pathfinding.js";
import { compareBeforeAfter } from "../src/compare.js";

describe("graphFromWalkableGeoJson", () => {
  it("builds a routable graph from LineString features (starter-data plug-in shape)", () => {
    const graph = graphFromWalkableGeoJson({
      edges: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              edgeId: "sidewalk-a",
              wheelchairAccessible: true,
              lengthMeters: 25,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [-71.184, 42.293],
                [-71.1835, 42.293],
              ],
            },
          },
          {
            type: "Feature",
            properties: {
              edgeId: "crossing-blocked",
              wheelchairAccessible: false,
              lengthMeters: 12,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [-71.1835, 42.293],
                [-71.183, 42.293],
              ],
            },
          },
          {
            type: "Feature",
            properties: {
              edgeId: "detour",
              wheelchairAccessible: true,
              lengthMeters: 40,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [-71.184, 42.293],
                [-71.184, 42.2925],
                [-71.183, 42.2925],
                [-71.183, 42.293],
              ],
            },
          },
        ],
      },
    });

    expect(graph.edges).toHaveLength(3);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);

    const origin = graph.edges.find((e) => e.id === "sidewalk-a")!.from;
    const destination = graph.edges.find((e) => e.id === "crossing-blocked")!.to;

    const before = findShortestPath(graph, {
      originId: origin,
      destinationId: destination,
      requireWheelchairAccessible: true,
    });
    expect(before.found).toBe(true);
    if (!before.found) return;
    expect(before.edgeIds).toEqual(["detour"]);
    expect(before.distanceMeters).toBe(40);

    const comparison = compareBeforeAfter({
      scenarioId: "geojson-plug-in",
      interventionId: "open-crossing",
      graph,
      query: {
        originId: origin,
        destinationId: destination,
        requireWheelchairAccessible: true,
      },
      graphChanges: [{ edgeId: "crossing-blocked", accessible: true }],
    });

    expect(comparison.after.found).toBe(true);
    if (!comparison.after.found) return;
    expect(comparison.after.distanceMeters).toBe(37);
    expect(comparison.after.edgeIds).toEqual([
      "sidewalk-a",
      "crossing-blocked",
    ]);
    expect(comparison.after.distanceMeters).toBeLessThan(
      before.distanceMeters,
    );
  });
});
