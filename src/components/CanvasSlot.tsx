import type { AppMode } from '../types'

type Props = {
  mode: AppMode
  reducedMotion: boolean
  locationLabel: string
  focusLabel?: string
}

export function CanvasSlot({
  mode,
  reducedMotion,
  locationLabel,
  focusLabel,
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
          {focusLabel ? ` · ${focusLabel}` : ''}
        </p>
      </div>
    </section>
  )
}
