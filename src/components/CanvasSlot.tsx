import basemap from '../../data/wellesley/basemap.geojson'
import type { CompareResult } from '../data/api'
import { defaultProjector } from '../showcase/layout'
import { PLACEHOLDER_BARRIERS } from '../showcase/placeholder'
import { ShowcaseCanvas } from '../showcase/ShowcaseCanvas'
import '../showcase/styles.css'
import type { AppMode, Barrier } from '../types'

type Props = {
  mode: AppMode
  selectedBarrier: Barrier | null
  selectedBarrierId: string | null
  selectedInterventionId: string | null
  reducedMotion: boolean
  locationLabel: string
  compare: CompareResult | null
  onSelectBarrier: (id: string) => void
  onSelectIntervention: (id: string) => void
}

function routePointsFromCompare(
  compare: CompareResult | null,
  interventionSelected: boolean,
): { points: readonly (readonly [number, number, number])[] } | undefined {
  if (!compare) return undefined
  const geometry =
    interventionSelected && compare.after.geometry.length > 0
      ? compare.after.geometry
      : compare.before.geometry
  if (geometry.length < 2) return undefined
  return {
    points: geometry.map(([lon, lat]) =>
      defaultProjector.project3(lon, lat, 0.12),
    ),
  }
}

/**
 * Hosts the 3D Showcase canvas inside Accessible Interface chrome.
 * Selection ids flow up; this slot does not rebuild the toolbar or panels.
 */
export function CanvasSlot({
  mode,
  selectedBarrier,
  selectedBarrierId,
  selectedInterventionId,
  reducedMotion,
  locationLabel,
  compare,
  onSelectBarrier,
  onSelectIntervention,
}: Props) {
  const routeGeometry = routePointsFromCompare(
    compare,
    Boolean(selectedInterventionId),
  )

  return (
    <section
      className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
      aria-label="Neighborhood canvas"
    >
      <ShowcaseCanvas
        geoJson={basemap}
        barriers={PLACEHOLDER_BARRIERS}
        routeGeometry={routeGeometry}
        reducedMotion={reducedMotion}
        selectedBarrierId={selectedBarrierId}
        selectedInterventionId={selectedInterventionId}
        onSelectBarrier={onSelectBarrier}
        onSelectIntervention={onSelectIntervention}
      />
      <p className="sr-only">
        {locationLabel}. Mode {mode}.
        {selectedBarrier
          ? ` Focus: ${selectedBarrier.locationLabel}.`
          : ' Select a barrier in Explore.'}
        {compare
          ? ` Modeled route ${compare.beforeMeters ?? 'n/a'} m to ${compare.afterMeters ?? 'n/a'} m.`
          : ''}
      </p>
    </section>
  )
}
