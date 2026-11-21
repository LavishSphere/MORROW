import type { CompareResult } from '../data/api'
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
      <div className="canvas-slot__atmosphere" aria-hidden="true" />
      <div className="canvas-slot__grid" aria-hidden="true" />

      <div className="canvas-slot__content">
        <p className="canvas-slot__eyebrow">3D canvas reserved</p>
        <h1 className="canvas-slot__brand">MORROW</h1>
        <p className="canvas-slot__tagline">Make tomorrow possible.</p>
        <p className="canvas-slot__place">{locationLabel}</p>
        <p className="canvas-slot__note">
          Placeholder for the React Three Fiber Wellesley scene. Mode:{' '}
          <strong>{mode}</strong>
          {selectedBarrier
            ? ` · Focus: ${selectedBarrier.locationLabel}`
            : ' · Select a barrier in Explore'}
        </p>
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
