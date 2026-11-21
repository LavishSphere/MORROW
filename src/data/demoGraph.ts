import type { PedestrianGraph } from '@morrow/routing'

/** Edge ids must match Intervention.graphChanges in fixtures. */
export const WELLESLEY_DEMO_GRAPH: PedestrianGraph = {
  nodes: [
    { id: 'home', coordinates: [-71.305, 42.292] },
    { id: 'ramp', coordinates: [-71.3035, 42.293] },
    { id: 'library', coordinates: [-71.3025, 42.2936] },
    { id: 'connector', coordinates: [-71.3048, 42.2945] },
  ],
  edges: [
    { id: 'home-ramp', from: 'home', to: 'ramp', lengthMeters: 120, accessible: false },
    { id: 'ramp-library', from: 'ramp', to: 'library', lengthMeters: 90, accessible: true },
    { id: 'home-library', from: 'home', to: 'library', lengthMeters: 420, accessible: true },
    { id: 'home-connector', from: 'home', to: 'connector', lengthMeters: 80, accessible: false },
    { id: 'connector-library', from: 'connector', to: 'library', lengthMeters: 100, accessible: true },
  ],
}
