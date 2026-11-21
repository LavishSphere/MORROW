import type { Barrier, Intervention, LocationOption, Scenario } from '../types'
import { MODELED_IMPACT_ASSUMPTIONS } from '../routing/types'

/**
 * Bundled Wellesley demo fixtures.
 * Stand in for Ashsmith APIs until those endpoints are available.
 * Evidence status is honest: this scenario is illustrative.
 */

export const LOCATIONS: LocationOption[] = [
  {
    id: 'wellesley',
    label: 'Wellesley, MA',
    featured: true,
    available: true,
  },
  {
    id: 'cambridge',
    label: 'Cambridge, MA',
    available: false,
  },
  {
    id: 'boston',
    label: 'Boston, MA',
    available: false,
  },
]

export const BARRIERS: Barrier[] = [
  {
    id: 'wellesley-crossing-01',
    coordinates: [-71.3025, 42.2936],
    type: 'missing_ramp',
    evidenceStatus: 'illustrative',
    description:
      'Illustrative curb gap at a campus-adjacent crossing. Used to demonstrate the explore → improve → compare → propose loop; not a verified municipal finding.',
    locationLabel: 'Wellesley showcase crossing (near campus)',
  },
  {
    id: 'wellesley-path-02',
    coordinates: [-71.3041, 42.2948],
    type: 'blocked_path',
    evidenceStatus: 'illustrative',
    description:
      'Illustrative mid-block path interruption on a walkable connector. Demonstration geometry only.',
    locationLabel: 'Wellesley showcase connector path',
  },
]

export const INTERVENTIONS: Intervention[] = [
  {
    id: 'int-ramp-01',
    barrierId: 'wellesley-crossing-01',
    type: 'install_ramp',
    description: 'Add an accessible curb connection at the crossing.',
    graphChanges: [
      { edgeId: 'edge-crossing-a', accessible: true, weight: 18 },
    ],
  },
  {
    id: 'int-path-02',
    barrierId: 'wellesley-path-02',
    type: 'connect_path',
    description: 'Restore a continuous accessible connector between blocks.',
    graphChanges: [
      { edgeId: 'edge-connector-b', accessible: true, weight: 42 },
    ],
  },
]

export const SCENARIO: Scenario = {
  id: 'wellesley-demo-01',
  city: 'Wellesley, MA',
  label: 'Campus-adjacent accessible trip',
  originLabel: 'Residential block (demo origin)',
  destinationLabel: 'Public destination near campus',
  originId: 'origin',
  destinationId: 'destination',
  barrierId: 'wellesley-crossing-01',
  interventionId: 'int-ramp-01',
  modelAssumptions: [...MODELED_IMPACT_ASSUMPTIONS],
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
