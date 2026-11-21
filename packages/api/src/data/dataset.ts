/**
 * Loads the checked-in Wellesley demo dataset + basemap.
 * Used when Tiger Data / PostGIS is unset or unreachable (WHA-9).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Barrier,
  DemoDataset,
  DemoScenario,
  GraphChange,
  Intervention,
} from "../../../../shared/types.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

type RawBarrier = {
  id: string;
  coordinates: [number, number];
  type: Barrier["type"];
  evidenceStatus: Barrier["evidenceStatus"];
  description: string;
  source?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  observedAt?: string;
  locationLabel?: string;
  city?: string;
};

type RawDataset = Omit<DemoDataset, "barriers"> & {
  barriers: RawBarrier[];
};

const raw = loadJson<RawDataset>("data/wellesley/demo-dataset.json");

export const basemapGeoJSON: unknown = loadJson("data/wellesley/basemap.geojson");

export const dataset: DemoDataset = {
  ...raw,
  barriers: raw.barriers.map((b) => ({
    id: b.id,
    coordinates: b.coordinates,
    type: b.type,
    evidenceStatus: b.evidenceStatus,
    description: b.description,
    source: b.source,
    sourceTitle: b.sourceTitle ?? b.source,
    sourceUrl: b.sourceUrl,
    observedAt: b.observedAt,
    locationLabel: b.locationLabel,
    city: b.city,
  })),
};

function graphChangesEqual(a: GraphChange[], b: GraphChange[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assertLinkedGraphChanges(data: DemoDataset): void {
  const linked = data.interventions.find(
    (item) => item.id === data.scenario.interventionId,
  );
  if (!linked) {
    throw new Error(
      `Unknown scenario.interventionId: ${data.scenario.interventionId}`,
    );
  }
  if (!graphChangesEqual(data.scenario.graphChanges, linked.graphChanges)) {
    throw new Error(
      "scenario.graphChanges must deep-equal the linked intervention.graphChanges",
    );
  }
}

assertLinkedGraphChanges(dataset);

export const scenario: DemoScenario = dataset.scenario;

export function listBarriers(): Barrier[] {
  return dataset.barriers;
}

export function getBarrier(id: string): Barrier | undefined {
  return dataset.barriers.find((b) => b.id === id);
}

export function getIntervention(id: string): Intervention | undefined {
  return dataset.interventions.find((i) => i.id === id);
}

/** Canonical graphChanges for an intervention id. Throws if the id is missing. */
export function graphChangesForIntervention(
  interventionId: string,
): GraphChange[] {
  const intervention = getIntervention(interventionId);
  if (!intervention) {
    throw new Error(`Unknown interventionId: ${interventionId}`);
  }
  if (intervention.graphChanges.length === 0) {
    throw new Error(`Intervention ${interventionId} has empty graphChanges`);
  }
  return intervention.graphChanges;
}

export function getScenario(id: string): DemoScenario | undefined {
  return id === scenario.id ? scenario : undefined;
}

/** Filter barriers whose lon/lat falls inside west,south,east,north. */
export function barriersInBbox(
  west: number,
  south: number,
  east: number,
  north: number,
): Barrier[] {
  return dataset.barriers.filter((b) => {
    const [lon, lat] = b.coordinates;
    return lon >= west && lon <= east && lat >= south && lat <= north;
  });
}
