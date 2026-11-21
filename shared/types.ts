/**
 * Shared MORROW domain types for Phase 1.
 *
 * Consumed by Accessible Interface, 3D Showcase, Routing, and the proposal API.
 * Keep ids and graphChanges stable once a scenario ships.
 */

/** Provenance honesty label for barriers and proposal facts. */
export type EvidenceStatus =
  | 'verified'
  | 'community_reported'
  | 'illustrative';

export type BarrierType =
  | 'missing_ramp'
  | 'unsafe_crossing'
  | 'blocked_path';

export type InterventionType =
  | 'install_ramp'
  | 'improve_crossing'
  | 'connect_path';

/** Lon/lat WGS84, matching GeoJSON position order. */
export type LonLat = [longitude: number, latitude: number];

export type EvidenceSource = {
  title: string;
  url?: string;
  observedAt?: string;
};

export type Barrier = {
  id: string;
  coordinates: LonLat;
  type: BarrierType;
  evidenceStatus: EvidenceStatus;
  description: string;
  /** Short free-text provenance note (optional). Prefer evidenceSources when structured. */
  source?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  observedAt?: string;
  locationLabel?: string;
  city?: string;
};

export type GraphChange = {
  edgeId: string;
  accessible: boolean;
  weight?: number;
};

export type Intervention = {
  id: string;
  barrierId: string;
  type: InterventionType;
  description: string;
  graphChanges: GraphChange[];
};

/**
 * Trusted facts assembled by the server before Gemini or template drafting.
 * Route meters come from the routing module — never from the model.
 * originLabel / destinationLabel / nextSteps match the PDF seven-section brief.
 */
export type ProposalFacts = {
  city: string;
  locationLabel: string;
  evidenceStatus: EvidenceStatus;
  evidenceSources: EvidenceSource[];
  barrierType: string;
  intervention: string;
  beforeMeters: number | null;
  afterMeters: number | null;
  newlyReachableDestinations: number | null;
  modelAssumptions: string[];
  originLabel: string;
  destinationLabel: string;
  nextSteps: string;
};

/** Structured draft prose (Gemini or deterministic template). */
export type DraftProposal = {
  headline: string;
  plainLanguageSummary: string;
  requestForReview: string;
  meetingTalkingPoints: string[];
  limitations: string;
};

/** Body for POST /api/proposals/generate — ids only; server reloads trusted data. */
export type GenerateProposalRequest = {
  scenarioId: string;
  barrierId: string;
  interventionId: string;
};

/** Response from generate / GET proposal by id. */
export type GenerateProposalResponse = {
  proposalId: string;
  facts: ProposalFacts;
  draft: DraftProposal;
  aiGenerated: boolean;
  warnings: string[];
  /** True when a Gemini key is configured (may still fall back to template). */
  geminiAvailable: boolean;
  /** Always true for live API responses; clients use this vs bundled fallback. */
  apiAvailable: boolean;
  /** True when generate ran through the Mastra proposal workflow. */
  mastra?: boolean;
  /** Mastra step ids completed for this generate call (observability). */
  workflowSteps?: string[];
};

/** Showcase bounding box in WGS84. */
export type ShowcaseBBox = {
  west: number;
  south: number;
  east: number;
  north: number;
  crs: 'EPSG:4326';
  label: string;
  center: LonLat;
};

/**
 * One complete demo trip: origin → destination with a single barrier/intervention.
 * graphChanges mirrors the linked intervention so routing can apply edits by scenario alone.
 */
export type DemoScenario = {
  id: string;
  label: string;
  city: string;
  origin: LonLat;
  destination: LonLat;
  originLabel: string;
  destinationLabel: string;
  barrierId: string;
  interventionId: string;
  evidenceStatus: EvidenceStatus;
  graphChanges: GraphChange[];
  assumptions: string[];
};

/** Offline bundle shape for when Tiger Data / the API is unavailable. */
export type DemoDataset = {
  version: number;
  locationId: string;
  honesty: {
    basemap: string;
    barriers: string;
    routing: string;
  };
  bbox: ShowcaseBBox;
  basemapPath: string;
  barriers: Barrier[];
  interventions: Intervention[];
  scenario: DemoScenario;
};
