export type Barrier = {
  id: string;
  label: string;
  kind: string;
  position: readonly [number, number, number];
  /** Intervention that replaces this barrier when it is selected. */
  interventionId?: string;
};

export type RouteGeometry = {
  points: readonly (readonly [number, number, number])[];
};

export type ShowcaseCanvasProps = {
  /** Optional extract. Phase 1 still draws invented footprints. */
  geoJson?: unknown;
  barriers: readonly Barrier[];
  selectedBarrierId?: string | null;
  selectedInterventionId?: string | null;
  routeGeometry?: RouteGeometry;
  reducedMotion?: boolean;
  onSelectBarrier?: (id: string) => void;
  onSelectIntervention?: (id: string) => void;
};

export type OpeningSequenceProps = {
  reducedMotion?: boolean;
};

export type RouteRibbonProps = {
  routeGeometry?: RouteGeometry;
  reducedMotion?: boolean;
};

export type BarrierMarkersProps = {
  barriers: readonly Barrier[];
  selectedBarrierId?: string | null;
  selectedInterventionId?: string | null;
  reducedMotion?: boolean;
  onSelectBarrier?: (id: string) => void;
  onSelectIntervention?: (id: string) => void;
};
