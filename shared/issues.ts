/**
 * Accessibility issues read from OpenStreetMap tags, and what fixing them
 * changes. Shared by the web app (to show and improve issues) and the API
 * (to recompute trusted facts for a proposal from issue ids alone).
 *
 * Every issue comes from a tag a mapper recorded (steps, crossing=unmarked,
 * sidewalk=no, an unpaved surface). That is community-reported data, not a
 * field survey, and the UI says so.
 */

import {
  fromWalkableGeoJSON,
  haversineMeters,
  MODELED_IMPACT_ASSUMPTIONS,
  shortestPath,
  snapNearestNode,
} from "@morrow/routing";
import type { DraftProposal, IssueFact, LonLat, ProposalFacts } from "./types.ts";

export type IssueKind = "stairs" | "unmarked_crossing" | "no_sidewalk" | "unpaved_path";

export type MapIssue = {
  /** Stable id: `${kind}-${osmWayId}`. */
  id: string;
  kind: IssueKind;
  title: string;
  /** Street or path name, or the nearest named street. */
  where: string;
  /** Marker position. */
  point: LonLat;
  /** The way the issue is on. */
  line: LonLat[];
  /** For missing sidewalks: which side(s). */
  sides?: "both" | "left" | "right";
  fix: string;
  evidenceStatus: "community_reported";
  source: string;
  sourceUrl: string;
};

export type IssueMetric = { label: string; value: string };

export type IssueMeasure = {
  before: string;
  after: string;
  metrics: IssueMetric[];
  /** True when the numbers come from the routing model, not just geometry. */
  modeled: boolean;
  assumptions: string[];
};

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  stairs: "Stairs",
  unmarked_crossing: "Unmarked crossing",
  no_sidewalk: "No sidewalk",
  unpaved_path: "Unpaved path",
};

const FIX: Record<IssueKind, string> = {
  stairs: "Add a ramp beside the stairs so the route is step-free.",
  unmarked_crossing: "Paint a crosswalk and add curb ramps with tactile paving at both ends.",
  no_sidewalk: "Build a sidewalk along this stretch of street.",
  unpaved_path: "Pave the path with a firm, smooth, slip-resistant surface.",
};

const UNPAVED = new Set(["dirt", "ground", "sand", "grass", "gravel", "unpaved", "mud", "woodchips", "earth"]);
const WALK_LAYERS = new Set(["footway", "path", "sidewalk"]);
/** Ignore tiny fragments; they are usually mapping artifacts. */
const MIN_LENGTH_M = 15;
/** Area around stairs searched for a step-free alternative. */
const DETOUR_RADIUS_M = 450;

type Feature = {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown> | null;
};

function features(collection: unknown): Feature[] {
  const list = (collection as { features?: unknown })?.features;
  return Array.isArray(list) ? (list as Feature[]) : [];
}

function lineOf(feature: Feature): LonLat[] {
  if (feature.geometry?.type !== "LineString" || !Array.isArray(feature.geometry.coordinates)) return [];
  return (feature.geometry.coordinates as unknown[]).filter(
    (p): p is LonLat => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number",
  );
}

function lengthMeters(line: LonLat[]) {
  let total = 0;
  for (let i = 0; i < line.length - 1; i += 1) total += haversineMeters(line[i]!, line[i + 1]!);
  return total;
}

function midpoint(line: LonLat[]): LonLat {
  const half = lengthMeters(line) / 2;
  let walked = 0;
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const step = haversineMeters(a, b);
    if (walked + step >= half && step > 0) {
      const t = (half - walked) / step;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += step;
  }
  return line[0] ?? [0, 0];
}

/** Rough metres between a point and a polyline (fine at town scale). */
function distanceToLine(point: LonLat, line: LonLat[]) {
  const k = Math.cos((point[1] * Math.PI) / 180) * 111_320;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const ax = (line[i]![0] - point[0]) * k;
    const az = (line[i]![1] - point[1]) * 111_320;
    const bx = (line[i + 1]![0] - point[0]) * k;
    const bz = (line[i + 1]![1] - point[1]) * 111_320;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, -(ax * dx + az * dz) / len2));
    best = Math.min(best, Math.hypot(ax + dx * t, az + dz * t));
  }
  return best;
}

function osmId(feature: Feature) {
  return String(feature.properties?.osmId ?? "");
}

function sidewalkSides(props: Record<string, unknown>): MapIssue["sides"] | null {
  const no = (value: unknown) => value === "no" || value === "none";
  if (no(props.sidewalk) || no(props["sidewalk:both"])) return "both";
  const left = no(props["sidewalk:left"]);
  const right = no(props["sidewalk:right"]);
  if (left && right) return "both";
  if (props.sidewalk === "left" || (right && !left)) return "right";
  if (props.sidewalk === "right" || (left && !right)) return "left";
  return null;
}

/** Find accessibility issues in a basemap-shaped FeatureCollection. */
export function detectIssues(collection: unknown): MapIssue[] {
  const all = features(collection);
  const namedRoads = all
    .filter((f) => f.properties?.layer === "road" && typeof f.properties?.name === "string")
    .map((f) => {
      const line = lineOf(f);
      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const [lon, lat] of line) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
      return { name: String(f.properties!.name), line, minLon, maxLon, minLat, maxLat };
    });
  const nearestStreet = (point: LonLat) => {
    let best: string | null = null;
    let bestD = 60;
    const k = Math.cos((point[1] * Math.PI) / 180) * 111_320;
    for (const road of namedRoads) {
      // A road whose box is already farther than the best match cannot win.
      const awayX = Math.max(road.minLon - point[0], point[0] - road.maxLon) * k;
      const awayZ = Math.max(road.minLat - point[1], point[1] - road.maxLat) * 111_320;
      if (awayX >= bestD || awayZ >= bestD) continue;
      const d = distanceToLine(point, road.line);
      if (d < bestD) {
        bestD = d;
        best = road.name;
      }
    }
    return best;
  };

  const issues: MapIssue[] = [];
  for (const feature of all) {
    const props = feature.properties ?? {};
    const line = lineOf(feature);
    if (line.length < 2) continue;
    const id = osmId(feature);
    if (!id) continue;
    const length = lengthMeters(line);
    const point = midpoint(line);
    const name = typeof props.name === "string" ? props.name : null;
    const base = {
      point,
      line,
      evidenceStatus: "community_reported" as const,
      sourceUrl: `https://www.openstreetmap.org/way/${id}`,
    };

    if (props.highway === "steps") {
      const near = nearestStreet(point);
      issues.push({
        ...base,
        id: `stairs-${id}`,
        kind: "stairs",
        title: "Stairs block a step-free route",
        where: name ?? (near ? `Path near ${near}` : "Walking path"),
        fix: FIX.stairs,
        source: `OpenStreetMap: highway=steps (way ${id})`,
      });
    } else if (props.footway === "crossing" && props.crossing === "unmarked") {
      issues.push({
        ...base,
        id: `unmarked_crossing-${id}`,
        kind: "unmarked_crossing",
        title: "Crossing with no markings",
        where: nearestStreet(point) ?? "Street crossing",
        fix: FIX.unmarked_crossing,
        source: `OpenStreetMap: footway=crossing, crossing=unmarked (way ${id})`,
      });
    } else if (props.layer === "road" && length >= MIN_LENGTH_M) {
      const sides = sidewalkSides(props);
      if (!sides) continue;
      issues.push({
        ...base,
        id: `no_sidewalk-${id}`,
        kind: "no_sidewalk",
        title: sides === "both" ? "No sidewalk on either side" : "No sidewalk on one side",
        where: name ?? nearestStreet(point) ?? "Street",
        sides,
        fix: FIX.no_sidewalk,
        source: `OpenStreetMap: sidewalk tagged "no" (way ${id})`,
      });
    } else if (
      WALK_LAYERS.has(String(props.layer)) &&
      UNPAVED.has(String(props.surface)) &&
      length >= MIN_LENGTH_M
    ) {
      const near = nearestStreet(point);
      issues.push({
        ...base,
        id: `unpaved_path-${id}`,
        kind: "unpaved_path",
        title: `Unpaved ${String(props.surface)} path`,
        where: name ?? (near ? `Path near ${near}` : "Walking path"),
        fix: FIX.unpaved_path,
        source: `OpenStreetMap: surface=${String(props.surface)} (way ${id})`,
      });
    }
  }
  return issues;
}

const meters = (value: number) => `${Math.round(value)} m`;

/** Walkable ways within `radius` metres of a point, as a small collection. */
function around(collection: unknown, center: LonLat, radius: number) {
  return {
    type: "FeatureCollection",
    features: features(collection).filter((f) => {
      if (f.properties?.layer === "building") return false;
      return lineOf(f).some((p) => haversineMeters(p, center) < radius);
    }),
  };
}

function stairsDetour(issue: MapIssue, collection: unknown): IssueMeasure {
  const start = issue.line[0]!;
  const end = issue.line[issue.line.length - 1]!;
  const stairsLength = lengthMeters(issue.line);
  const local = around(collection, issue.point, DETOUR_RADIUS_M);
  const stairsWay = issue.id.replace("stairs-", "");
  // After: the same stairs, rebuilt as a ramp a wheelchair can use.
  const ramped = {
    ...local,
    features: local.features.map((f) =>
      osmId(f) === stairsWay ? { ...f, properties: { ...f.properties, highway: "footway" } } : f,
    ),
  };
  const route = (fc: unknown) => {
    const graph = fromWalkableGeoJSON(fc);
    const originId = snapNearestNode(graph, start, { largestComponent: false });
    const destinationId = snapNearestNode(graph, end, { largestComponent: false });
    // Very short flights merge into one routing node; there is no trip to model.
    if (originId === destinationId) throw new Error("stairs too short to route");
    return shortestPath(graph, { originId, destinationId, requireAccessible: true });
  };
  try {
    const before = route(local);
    const after = route(ramped);
    const afterMeters = after.reachable && after.distanceMeters !== null ? after.distanceMeters : stairsLength;
    const beforeMeters = before.reachable ? before.distanceMeters : null;
    const saved = beforeMeters !== null ? beforeMeters - afterMeters : null;
    return {
      before:
        beforeMeters !== null
          ? `A wheelchair user detours ${meters(beforeMeters)} around the stairs.`
          : `No step-free way around the stairs within ${DETOUR_RADIUS_M} m.`,
      after:
        saved !== null
          ? `A ramp makes it ${meters(afterMeters)}, ${meters(saved)} shorter.`
          : `A ramp opens a ${meters(afterMeters)} step-free link.`,
      metrics: [
        {
          label: "Step-free route today",
          value: beforeMeters !== null ? meters(beforeMeters) : `None within ${DETOUR_RADIUS_M} m`,
        },
        { label: "With a ramp", value: meters(afterMeters) },
      ],
      modeled: true,
      assumptions: [...MODELED_IMPACT_ASSUMPTIONS],
    };
  } catch {
    return {
      before: `A short flight of stairs (${meters(stairsLength)}) with no step-free option.`,
      after: "A ramp makes this link step-free.",
      metrics: [{ label: "Stairs length", value: meters(stairsLength) }],
      modeled: false,
      assumptions: ["Too short to model a detour; length is measured from the map."],
    };
  }
}

/** What fixing an issue changes. Routing-modeled for stairs; measured otherwise. */
export function measureIssue(issue: MapIssue, collection: unknown): IssueMeasure {
  const length = lengthMeters(issue.line);
  switch (issue.kind) {
    case "stairs":
      return stairsDetour(issue, collection);
    case "unmarked_crossing":
      return {
        before: `People cross ${issue.where} here with no markings.`,
        after: "A marked crosswalk with curb ramps and tactile paving.",
        metrics: [{ label: "Crossing length", value: meters(length) }],
        modeled: false,
        assumptions: ["Safety benefit is not modeled; length is measured from the map."],
      };
    case "no_sidewalk": {
      const sides = issue.sides === "both" ? 2 : 1;
      return {
        before: `${meters(length)} of ${issue.where} with no sidewalk${sides === 2 ? " on either side" : " on one side"}.`,
        after: `${meters(length * sides)} of new sidewalk.`,
        metrics: [
          { label: "Street without sidewalk", value: meters(length) },
          { label: "New sidewalk", value: meters(length * sides) },
        ],
        modeled: false,
        assumptions: ["Length is measured from the map; construction cost is not estimated."],
      };
    }
    case "unpaved_path":
      return {
        before: `${meters(length)} of unpaved path that wheels and canes sink into.`,
        after: `${meters(length)} of firm, smooth paving.`,
        metrics: [{ label: "Path to pave", value: meters(length) }],
        modeled: false,
        assumptions: ["Length is measured from the map."],
      };
  }
}

/** The trusted facts a proposal carries for one issue. */
export function issueFact(issue: MapIssue, collection: unknown): IssueFact {
  const measure = measureIssue(issue, collection);
  return {
    id: issue.id,
    kind: issue.kind,
    title: issue.title,
    where: issue.where,
    fix: issue.fix,
    evidenceStatus: issue.evidenceStatus,
    source: issue.source,
    sourceUrl: issue.sourceUrl,
    before: measure.before,
    after: measure.after,
    metrics: measure.metrics,
    modeled: measure.modeled,
  };
}

const ISSUE_ASSUMPTIONS = [
  "Issues come from OpenStreetMap tags recorded by community mappers, not a field survey.",
  "Stair detours are modeled with the MORROW routing graph; other lengths are measured from the map.",
];

/** Proposal facts when the proposal is only the resident's picked issues. */
export function issuesOnlyFacts(issues: IssueFact[], city: string): ProposalFacts {
  const first = issues[0];
  const more = issues.length - 1;
  return {
    city,
    locationLabel: first ? `${first.where}${more > 0 ? ` and ${more} more place${more === 1 ? "" : "s"}` : ""}` : city,
    evidenceStatus: "community_reported",
    evidenceSources: issues.map((issue) => ({ title: issue.source, url: issue.sourceUrl })),
    barrierType: [...new Set(issues.map((issue) => issue.kind))].join(", "),
    intervention: issues.map((issue) => issue.fix).join(" "),
    beforeMeters: null,
    afterMeters: null,
    newlyReachableDestinations: null,
    modelAssumptions: ISSUE_ASSUMPTIONS,
    originLabel: "",
    destinationLabel: "",
    nextSteps:
      "Share this draft with neighbors or local advocates. Do not invent a specific department submission link without verification.",
    issues,
    scope: "issues",
  };
}

/** Deterministic draft for an issues-only proposal (Gemini unavailable). */
export function buildIssuesDraft(facts: ProposalFacts): DraftProposal {
  const issues = facts.issues ?? [];
  const count = issues.length;
  const plural = count === 1 ? "" : "s";
  return {
    headline: `Fix ${count} walking barrier${plural} in ${facts.city}`,
    plainLanguageSummary: `This draft asks ${facts.city} to review ${count} accessibility problem${plural} recorded in OpenStreetMap by community mappers (not a field survey): ${issues
      .map((issue) => `${issue.title.toLowerCase()} at ${issue.where} — ${issue.after.replace(/\.$/, "")}`)
      .join("; ")}.`,
    requestForReview:
      "Please review these locations on site and evaluate whether the suggested fixes are feasible. This document is a community conversation aid, not an engineering or construction recommendation.",
    meetingTalkingPoints: issues
      .slice(0, 8)
      .map((issue) => `${issue.where}: ${issue.before} Fix: ${issue.fix}`),
    limitations: [
      ...facts.modelAssumptions,
      "No site inspection; do not treat this draft as verified municipal findings or cost estimates.",
    ].join(" "),
  };
}
