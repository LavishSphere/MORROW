export type EvidenceStatus = 'verified' | 'community_reported' | 'illustrative'
export type BarrierType = 'missing_ramp' | 'unsafe_crossing' | 'blocked_path'
export type InterventionType = 'install_ramp' | 'improve_crossing' | 'connect_path'
export type AppMode = 'explore' | 'improve' | 'compare' | 'propose'
export type SurfaceView = 'canvas' | 'list'

export type Barrier = {
  id: string
  coordinates: [number, number]
  type: BarrierType
  evidenceStatus: EvidenceStatus
  sourceTitle?: string
  sourceUrl?: string
  description: string
  locationLabel: string
}

export type Intervention = {
  id: string
  barrierId: string
  type: InterventionType
  description: string
  graphChanges: Array<{
    edgeId: string
    accessible: boolean
    weight?: number
  }>
}

export type Scenario = {
  id: string
  city: string
  label: string
  originLabel: string
  destinationLabel: string
  /** WGS84 lon/lat for compareScenario snapping. */
  origin: [number, number]
  destination: [number, number]
  barrierId: string
  interventionId: string
  modelAssumptions: string[]
}

export type LocationOption = {
  id: string
  label: string
  featured?: boolean
  available: boolean
}

export type EvidenceSource = {
  title: string
  url?: string
  observedAt?: string
}

export type ProposalFacts = {
  city: string
  locationLabel: string
  evidenceStatus: EvidenceStatus
  evidenceSources: EvidenceSource[]
  barrierType: string
  intervention: string
  beforeMeters: number | null
  afterMeters: number | null
  newlyReachableDestinations: number | null
  modelAssumptions: string[]
  originLabel: string
  destinationLabel: string
  nextSteps: string
}

export type DraftProposal = {
  headline: string
  plainLanguageSummary: string
  requestForReview: string
  meetingTalkingPoints: string[]
  limitations: string
}

export type GenerateProposalRequest = {
  scenarioId: string
  barrierId: string
  interventionId: string
}

export type GenerateProposalResponse = {
  proposalId: string
  facts: ProposalFacts
  draft: DraftProposal
  aiGenerated: boolean
  warnings: string[]
  geminiAvailable: boolean
  apiAvailable: boolean
}

export type { RouteComparison, RoutePath, GraphChange, RouteQuery } from '@morrow/routing'
