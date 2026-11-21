import type { CompareResult } from '../data/api'
import { ShowcaseCanvas } from '../showcase/ShowcaseCanvas'
import {
  PLACEHOLDER_BARRIERS,
  PLACEHOLDER_ROUTE,
} from '../showcase/placeholder'
import '../showcase/styles.css'
import type { AppMode, Barrier } from '../types'

type Props = {
  mode: AppMode
  selectedBarrier: Barrier | null
  reducedMotion: boolean
  locationLabel: string
  compare: CompareResult | null
}

function formatDelta(delta: number | null): string {
  if (delta == null) return 'n/a'
  if (delta === 0) return '0 m'
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(delta)} m`
}

export function CanvasSlot({
  mode,
  selectedBarrier,
  reducedMotion,
  locationLabel,
  compare,
}: Props) {
  return (
    <section
      className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
      aria-label="Neighborhood canvas"
    >
      <ShowcaseCanvas
        barriers={PLACEHOLDER_BARRIERS}
        routeGeometry={PLACEHOLDER_ROUTE}
        reducedMotion={reducedMotion}
        selectedBarrierId={selectedBarrier?.id ?? null}
      />

      <div className="canvas-slot__content">
        <p className="canvas-slot__place">{locationLabel}</p>
        {compare && (mode === 'compare' || mode === 'improve') && (
          <p className="canvas-slot__route" aria-live="polite">
            Modeled route: {compare.beforeMeters ?? 'n/a'} m →{' '}
            {compare.afterMeters ?? 'n/a'} m ({formatDelta(compare.deltaMeters)}
            )
            {compare.after.geometry.length > 0
              ? ` · ${compare.after.geometry.length} geometry points`
              : ''}
          </p>
        )}
      </div>
    </section>
  )
}
