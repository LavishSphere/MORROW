/** Shared domain types for Accessible Interface (Phase 1).
 *  Align with Ashsmith starter set when it lands; keep ids stable.
 */

export type EvidenceStatus = 'verified' | 'community_reported' | 'illustrative'

export type BarrierType = 'missing_ramp' | 'unsafe_crossing' | 'blocked_path'

export type InterventionType = 'install_ramp' | 'improve_crossing' | 'connect_path'

export type AppMode = 'explore' | 'improve' | 'compare' | 'propose'

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
  barrierId: string
  interventionId: string
  /** Modeled demo figures — replaced by routing engine in later phases. */
  modeledBeforeMeters: number
  modeledAfterMeters: number
  modelAssumptions: string[]
}

export type LocationOption = {
  id: string
  label: string
  featured?: boolean
  available: boolean
}
