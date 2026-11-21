import { buildTemplateDraft } from './templateProposal'
import { compareByIds, type CompareResult } from './compare'
import { BARRIERS, getBarrier, getIntervention, SCENARIO } from './fixtures'
import type {
  Barrier,
  GenerateProposalRequest,
  GenerateProposalResponse,
  Intervention,
  ProposalFacts,
  Scenario,
} from '../types'

export type { CompareResult }

/**
 * Client boundary for Ashsmith APIs + Sophia routing.
 * Barriers/generate/Gemini remain unavailable stubs (ids only).
 * Compare uses @morrow/routing.compareIntervention on the demo graph.
 */

export const API_STATUS = {
  barriersApi: false,
  generateApi: false,
  gemini: false,
  tigerData: false,
  morrowRouting: true,
} as const

export type BarriersResult = {
  source: 'bundled' | 'api'
  available: boolean
  barriers: Barrier[]
  note: string
  liveApiAvailable: boolean
}

export async function fetchBarriers(_bbox?: string): Promise<BarriersResult> {
  void _bbox
  return {
    source: 'bundled',
    available: true,
    barriers: BARRIERS,
    liveApiAvailable: API_STATUS.barriersApi,
    note: API_STATUS.barriersApi
      ? 'Live barrier API'
      : 'Bundled Wellesley fixtures — live barrier API unavailable.',
  }
}

export async function fetchBarrierById(id: string): Promise<Barrier | null> {
  return getBarrier(id) ?? null
}

export function getDemoScenario(): Scenario {
  return SCENARIO
}

export function getDemoIntervention(): Intervention | null {
  return getIntervention(SCENARIO.interventionId) ?? null
}

export { compareByIds }

function buildFacts(
  barrierId: string,
  interventionId: string,
  compare: CompareResult,
): ProposalFacts | null {
  const barrier = getBarrier(barrierId)
  const intervention = getIntervention(interventionId)
  if (!barrier || !intervention) return null

  return {
    city: SCENARIO.city,
    locationLabel: barrier.locationLabel,
    evidenceStatus: barrier.evidenceStatus,
    evidenceSources: barrier.sourceTitle
      ? [{ title: barrier.sourceTitle, url: barrier.sourceUrl }]
      : [],
    barrierType: barrier.type,
    intervention: intervention.description,
    beforeMeters: compare.beforeMeters,
    afterMeters: compare.afterMeters,
    newlyReachableDestinations: compare.becameReachable ? 1 : null,
    modelAssumptions: compare.assumptions,
    originLabel: SCENARIO.originLabel,
    destinationLabel: SCENARIO.destinationLabel,
    nextSteps:
      'Share this draft with neighbors or local advocates. Do not invent a specific department submission link without verification.',
  }
}

export async function generateProposal(
  req: GenerateProposalRequest,
): Promise<GenerateProposalResponse> {
  const compare = compareByIds({
    scenarioId: req.scenarioId,
    interventionId: req.interventionId,
  })
  const facts = buildFacts(req.barrierId, req.interventionId, compare)

  if (!facts) {
    return {
      proposalId: 'invalid',
      facts: {
        city: SCENARIO.city,
        locationLabel: 'Unknown',
        evidenceStatus: 'illustrative',
        evidenceSources: [],
        barrierType: 'unknown',
        intervention: 'unknown',
        beforeMeters: null,
        afterMeters: null,
        newlyReachableDestinations: null,
        modelAssumptions: [...SCENARIO.modelAssumptions],
        originLabel: SCENARIO.originLabel,
        destinationLabel: SCENARIO.destinationLabel,
        nextSteps: SCENARIO.label,
      },
      draft: {
        headline: 'Unable to generate proposal',
        plainLanguageSummary: 'Unknown scenario, barrier, or intervention id.',
        requestForReview: '',
        meetingTalkingPoints: [],
        limitations: 'Invalid ids rejected by client stub.',
      },
      aiGenerated: false,
      warnings: ['Unknown ids — proposal not generated.'],
      geminiAvailable: false,
      apiAvailable: false,
    }
  }

  const draft = buildTemplateDraft(facts)
  const warnings: string[] = []
  if (!API_STATUS.generateApi) {
    warnings.push('Generate API unavailable — using local template draft.')
  }
  if (!API_STATUS.gemini) {
    warnings.push('Gemini unavailable — template prose only.')
  }

  return {
    proposalId: `local-${req.scenarioId}-${req.barrierId}-${req.interventionId}`,
    facts,
    draft,
    aiGenerated: false,
    warnings,
    geminiAvailable: API_STATUS.gemini,
    apiAvailable: API_STATUS.generateApi,
  }
}
