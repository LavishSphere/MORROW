import { SatelliteTown } from '../satellite/town/SatelliteTown'
import type { AppMode } from '../types'

type Props = {
  mode: AppMode
  reducedMotion: boolean
}

/** Wellesley scene between the top bar and the mode bar. */
export function CanvasSlot({ mode, reducedMotion }: Props) {
  return (
    <section
      className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
      aria-label="Satellite view"
    >
      <SatelliteTown reducedMotion={reducedMotion} />
      <p className="sr-only">
        Wellesley College, Tower Court to Clapp Library. Illustrative. Mode{' '}
        {mode}.
      </p>
    </section>
  )
}
