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
 * Tries the live API when VITE_API_BASE is set (or same-origin /api via Vite proxy).
 * Bundled fixtures remain the labeled fallback when the API is unavailable.
 * Compare uses @morrow/routing.compareScenario on the bundled Wellesley graph.
 */

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  '',
) ?? ''

/** Resolved after the first successful health / barriers probe. */
let liveApiReachable: boolean | null = null

export type ApiStatus = {
  barriersApi: boolean
  generateApi: boolean
  gemini: boolean
  tigerData: boolean
  morrowRouting: boolean
}

export const API_STATUS: ApiStatus = {
  barriersApi: false,
  generateApi: false,
  gemini: false,
  tigerData: false,
  morrowRouting: true,
}

function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

async function probeLiveApi(): Promise<boolean> {
  // Cache successes only. A sticky false hid the API if it came up after
  // the first probe (local npm run dev without api:dev already running).
  if (liveApiReachable === true) return true
  try {
    const res = await fetch(apiUrl('/api/health'), {
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) {
      API_STATUS.barriersApi = false
      API_STATUS.generateApi = false
      API_STATUS.gemini = false
      API_STATUS.tigerData = false
      return false
    }
    const body = (await res.json()) as {
      ok?: boolean
      geminiConfigured?: boolean
      tigerData?: boolean
    }
    const ok = Boolean(body.ok)
    if (ok) liveApiReachable = true
    API_STATUS.barriersApi = ok
    API_STATUS.generateApi = ok
    API_STATUS.gemini = Boolean(body.geminiConfigured)
    API_STATUS.tigerData = Boolean(body.tigerData)
    return ok
  } catch {
    API_STATUS.barriersApi = false
    API_STATUS.generateApi = false
    API_STATUS.gemini = false
    API_STATUS.tigerData = false
    return false
  }
}

/** Test / storybook helper — reset cached probe. */
export function resetApiProbe(): void {
  liveApiReachable = null
  API_STATUS.barriersApi = false
  API_STATUS.generateApi = false
  API_STATUS.gemini = false
  API_STATUS.tigerData = false
}

export type BarriersResult = {
  source: 'bundled' | 'api'
  available: boolean
  barriers: Barrier[]
  note: string
  liveApiAvailable: boolean
}

function mapApiBarrier(raw: Record<string, unknown>): Barrier {
  return {
    id: String(raw.id),
    coordinates: raw.coordinates as [number, number],
    type: raw.type as Barrier['type'],
    evidenceStatus: raw.evidenceStatus as Barrier['evidenceStatus'],
    description: String(raw.description ?? ''),
    sourceTitle:
      typeof raw.sourceTitle === 'string'
        ? raw.sourceTitle
        : typeof raw.source === 'string'
          ? raw.source
          : undefined,
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : undefined,
    locationLabel: String(raw.locationLabel ?? raw.id),
  }
}

export async function fetchBarriers(bbox?: string): Promise<BarriersResult> {
  const live = await probeLiveApi()
  const box =
    bbox ??
    '-71.3085,42.291,-71.3005,42.2968'

  if (live) {
    try {
      const res = await fetch(apiUrl(`/api/barriers?bbox=${encodeURIComponent(box)}`), {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const body = (await res.json()) as {
          barriers?: Record<string, unknown>[]
          note?: string
        }
        const barriers = (body.barriers ?? []).map(mapApiBarrier)
        if (barriers.length > 0) {
          return {
            source: 'api',
            available: true,
            barriers,
            liveApiAvailable: true,
            note: body.note ?? 'Live barrier API',
          }
        }
      }
    } catch {
      liveApiReachable = null
      API_STATUS.barriersApi = false
      API_STATUS.generateApi = false
    }
  }

  return {
    source: 'bundled',
    available: true,
    barriers: BARRIERS,
    liveApiAvailable: false,
    note: 'Bundled Wellesley fixtures — live barrier API unavailable.',
  }
}

export async function fetchBarrierById(id: string): Promise<Barrier | null> {
  const live = await probeLiveApi()
  if (live) {
    try {
      const res = await fetch(apiUrl(`/api/barriers/${encodeURIComponent(id)}`), {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        return mapApiBarrier((await res.json()) as Record<string, unknown>)
      }
      if (res.status === 404) return null
    } catch {
      /* fall through */
    }
  }
  return getBarrier(id) ?? null
}

export function getDemoScenario(): Scenario {
  return SCENARIO
}

export function getDemoIntervention(): Intervention | null {
  return getIntervention(SCENARIO.interventionId) ?? null
}

export { compareByIds }

function idsMatchDemoScenario(
  req: GenerateProposalRequest,
  barrier: Barrier | undefined,
  intervention: Intervention | undefined,
): barrier is Barrier {
  return (
    req.scenarioId === SCENARIO.id &&
    barrier !== undefined &&
    intervention !== undefined &&
    intervention.barrierId === barrier.id &&
    SCENARIO.barrierId === barrier.id &&
    SCENARIO.interventionId === intervention.id
  )
}

function invalidGenerateResponse(): GenerateProposalResponse {
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
    modelAssumptions:
      SCENARIO.modelAssumptions.length > 0
        ? [...SCENARIO.modelAssumptions]
        : [...compare.assumptions],
    originLabel: SCENARIO.originLabel,
    destinationLabel: SCENARIO.destinationLabel,
    nextSteps:
      'Share this draft with neighbors or local advocates. Do not invent a specific department submission link without verification.',
  }
}

function bundledGenerate(
  req: GenerateProposalRequest,
): GenerateProposalResponse {
  const barrier = getBarrier(req.barrierId)
  const intervention = getIntervention(req.interventionId)
  if (!idsMatchDemoScenario(req, barrier, intervention)) {
    return invalidGenerateResponse()
  }

  const compare = compareByIds({
    scenarioId: req.scenarioId,
    interventionId: req.interventionId,
  })
  const facts = buildFacts(req.barrierId, req.interventionId, compare)

  if (!facts) {
    return invalidGenerateResponse()
  }

  const draft = buildTemplateDraft(facts)
  return {
    proposalId: `local-${req.scenarioId}-${req.barrierId}-${req.interventionId}`,
    facts,
    draft,
    aiGenerated: false,
    warnings: [
      'Generate API unavailable — using local template draft.',
      'Gemini unavailable — template prose only.',
    ],
    geminiAvailable: false,
    apiAvailable: false,
  }
}

export async function generateProposal(
  req: GenerateProposalRequest,
): Promise<GenerateProposalResponse> {
  const live = await probeLiveApi()
  if (live) {
    try {
      const res = await fetch(apiUrl('/api/proposals/generate'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          scenarioId: req.scenarioId,
          barrierId: req.barrierId,
          interventionId: req.interventionId,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (res.ok) {
        const body = (await res.json()) as GenerateProposalResponse
        API_STATUS.generateApi = true
        API_STATUS.gemini = Boolean(body.geminiAvailable)
        return {
          ...body,
          apiAvailable: true,
        }
      }
    } catch {
      liveApiReachable = null
      API_STATUS.generateApi = false
    }
  }

  return bundledGenerate(req)
}

export async function fetchProposalById(
  id: string,
): Promise<GenerateProposalResponse | null> {
  const live = await probeLiveApi()
  if (!live) return null
  try {
    const res = await fetch(apiUrl(`/api/proposals/${encodeURIComponent(id)}`), {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return (await res.json()) as GenerateProposalResponse
  } catch {
    return null
  }
}
