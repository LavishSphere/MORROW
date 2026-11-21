import { BARRIERS, getBarrier, getIntervention, SCENARIO } from './fixtures'
import type { Barrier, Intervention, Scenario } from '../types'

/**
 * Thin client boundary for future Ashsmith APIs.
 * Phase 1 always serves bundled fixtures and reports mock availability.
 */

export type DataSource = 'bundled' | 'api'

export type BarriersResult = {
  source: DataSource
  available: boolean
  barriers: Barrier[]
  note: string
}

export async function fetchBarriers(): Promise<BarriersResult> {
  // Future: GET /api/barriers?bbox=...
  return {
    source: 'bundled',
    available: true,
    barriers: BARRIERS,
    note: 'Using bundled Wellesley fixtures. Live Ashsmith barrier API is not wired yet.',
  }
}

export async function fetchBarrierById(id: string): Promise<Barrier | null> {
  // Future: GET /api/barriers/:id
  return getBarrier(id) ?? null
}

export function getDemoScenario(): Scenario {
  return SCENARIO
}

export function getDemoIntervention(): Intervention | null {
  return getIntervention(SCENARIO.interventionId) ?? null
}
