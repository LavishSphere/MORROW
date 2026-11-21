import { buildTemplateDraft } from './templateProposal'
import { compareInterventionByIds } from './compareMock'
import { BARRIERS, getBarrier, getIntervention, SCENARIO } from './fixtures'
import type {
  Barrier,
  GenerateProposalRequest,
  GenerateProposalResponse,
  Intervention,
  ProposalFacts,
  RouteComparison,
  Scenario,
} from '../types'

/**
 * Client boundary for future Ashsmith APIs + Sophia routing.
 * Real backends are marked unavailable; stubs accept ids only and rebuild facts locally.
 */

export const API_STATUS = {
  barriersApi: false,
  generateApi: false,
  gemini: false,
  tigerData: false,
  /** True only when `@morrow/routing` from #11/#12 is wired — never vendor a second copy. */
  morrowRouting: false,
} as const

export type BarriersResult = {
  source: 'bundled' | 'api'
  available: boolean
  barriers: Barrier[]
  note: string
  liveApiAvailable: boolean
}

export type CompareResult = RouteComparison & {
  scenarioId: string
  interventionId: string
  source: 'bundled-mock' | 'morrow-routing'
  routingPackageAvailable: boolean
}

export async function fetchBarriers(_bbox?: string): Promise<BarriersResult> {
  // Future: GET /api/barriers?bbox=...
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
  // Future: GET /api/barriers/:id — client sends id only
  return getBarrier(id) ?? null
}

export function getDemoScenario(): Scenario {
  return SCENARIO
}

export function getDemoIntervention(): Intervention | null {
  return getIntervention(SCENARIO.interventionId) ?? null
}

/**
 * Compare by ids only.
 * Today: bundled mock shaped like `compareIntervention` (#12).
 * Later: load graph + graphChanges by id, then call
 *   compareIntervention(graph, query, graphChanges) from `@morrow/routing`.
 */
export function compareByIds(input: {
  scenarioId: string
  interventionId: string
}): CompareResult {
  return compareInterventionByIds(input)
}

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
      ? [
          {
            title: barrier.sourceTitle,
            url: barrier.sourceUrl,
          },
        ]
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

/**
 * POST /api/proposals/generate stub.
 * Accepts known ids only; rebuilds facts from fixtures; template when Gemini unavailable.
 */
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
  if (!API_STATUS.morrowRouting) {
    warnings.push(
      'Routing package unavailable — Compare uses bundled mock shaped like compareIntervention (#12).',
    )
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
