import { MODELED_IMPACT_ASSUMPTIONS } from '@morrow/routing'
import demoDataset from '../../data/wellesley/demo-dataset.json'
import type { Barrier, Intervention, LocationOption, Scenario } from '../types'

export const LOCATIONS: LocationOption[] = [
  { id: 'wellesley', label: 'Wellesley, MA', featured: true, available: true },
  { id: 'cambridge', label: 'Cambridge, MA', available: false },
  { id: 'boston', label: 'Boston, MA', available: false },
]

/** Align UI fixtures with data/wellesley/demo-dataset.json (Ashsmith + Sophia). */
export const BARRIERS: Barrier[] = demoDataset.barriers.map((b) => ({
  id: b.id,
  coordinates: b.coordinates as [number, number],
  type: b.type as Barrier['type'],
  evidenceStatus: b.evidenceStatus as Barrier['evidenceStatus'],
  description: b.description,
  sourceTitle: b.source,
  locationLabel: b.locationLabel,
}))

export const INTERVENTIONS: Intervention[] = demoDataset.interventions.map(
  (i) => ({
    id: i.id,
    barrierId: i.barrierId,
    type: i.type as Intervention['type'],
    description: i.description,
    graphChanges: i.graphChanges.map((c) => ({
      edgeId: c.edgeId,
      accessible: c.accessible,
      ...(c.weight !== undefined ? { weight: c.weight } : {}),
    })),
  }),
)

const s = demoDataset.scenario

export const SCENARIO: Scenario = {
  id: s.id,
  city: s.city,
  label: s.label,
  originLabel: s.originLabel,
  destinationLabel: s.destinationLabel,
  origin: s.origin as [number, number],
  destination: s.destination as [number, number],
  barrierId: s.barrierId,
  interventionId: s.interventionId,
  modelAssumptions: s.assumptions?.length
    ? [...s.assumptions]
    : [...MODELED_IMPACT_ASSUMPTIONS],
}

export function getBarrier(id: string): Barrier | undefined {
  return BARRIERS.find((b) => b.id === id)
}

export function getIntervention(id: string): Intervention | undefined {
  return INTERVENTIONS.find((i) => i.id === id)
}

export function interventionsForBarrier(barrierId: string): Intervention[] {
  return INTERVENTIONS.filter((i) => i.barrierId === barrierId)
}
