import { BARRIERS, getBarrier, getIntervention, SCENARIO } from './fixtures'
import type { Barrier, Intervention, Scenario } from '../types'

export const API_STATUS = {
  barriersApi: false,
  generateApi: false,
  gemini: false,
  tigerData: false,
  morrowRouting: false,
} as const

export type BarriersResult = {
  source: 'bundled' | 'api'
  available: boolean
  barriers: Barrier[]
  note: string
  liveApiAvailable: boolean
}

export async function fetchBarriers(): Promise<BarriersResult> {
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
