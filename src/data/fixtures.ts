import { MODELED_IMPACT_ASSUMPTIONS } from '@morrow/routing'
import type { Barrier, Intervention, LocationOption, Scenario } from '../types'

export const LOCATIONS: LocationOption[] = [
  { id: 'wellesley', label: 'Wellesley, MA', featured: true, available: true },
  { id: 'cambridge', label: 'Cambridge, MA', available: false },
  { id: 'boston', label: 'Boston, MA', available: false },
]

export const BARRIERS: Barrier[] = [
  {
    id: 'wellesley-crossing-01',
    coordinates: [-71.3025, 42.2936],
    type: 'missing_ramp',
    evidenceStatus: 'illustrative',
    description:
      'Illustrative curb gap at a campus-adjacent crossing. Demonstration only — not a verified municipal finding.',
    locationLabel: 'Wellesley showcase crossing (near campus)',
  },
  {
    id: 'wellesley-path-02',
    coordinates: [-71.3041, 42.2948],
    type: 'blocked_path',
    evidenceStatus: 'illustrative',
    description:
      'Illustrative mid-block path interruption on a walkable connector.',
    locationLabel: 'Wellesley showcase connector path',
  },
]

export const INTERVENTIONS: Intervention[] = [
  {
    id: 'int-ramp-01',
    barrierId: 'wellesley-crossing-01',
    type: 'install_ramp',
    description: 'Add an accessible curb connection at the crossing.',
    graphChanges: [{ edgeId: 'home-ramp', accessible: true }],
  },
  {
    id: 'int-path-02',
    barrierId: 'wellesley-path-02',
    type: 'connect_path',
    description: 'Restore a continuous accessible connector between blocks.',
    graphChanges: [{ edgeId: 'home-connector', accessible: true }],
  },
]

export const SCENARIO: Scenario = {
  id: 'wellesley-demo-01',
  city: 'Wellesley, MA',
  label: 'Campus-adjacent accessible trip',
  originLabel: 'Residential block (demo origin)',
  destinationLabel: 'Public destination near campus',
  originId: 'home',
  destinationId: 'library',
  barrierId: 'wellesley-crossing-01',
  interventionId: 'int-ramp-01',
  modelAssumptions: [...MODELED_IMPACT_ASSUMPTIONS],
}

export function getBarrier(id: string) {
  return BARRIERS.find((b) => b.id === id)
}

export function getIntervention(id: string) {
  return INTERVENTIONS.find((i) => i.id === id)
}

export function interventionsForBarrier(barrierId: string) {
  return INTERVENTIONS.filter((i) => i.barrierId === barrierId)
}
