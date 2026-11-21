import { SatelliteTown } from '../satellite/town/SatelliteTown'
import type { AppMode } from '../types'

type Props = {
  mode: AppMode
  reducedMotion: boolean
}

/** Full-bleed Wellesley scene. Mode chrome stays off this surface. */
export function CanvasSlot({ mode, reducedMotion }: Props) {
  return (
    <section
      id="stage"
      className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
      role="tabpanel"
      aria-labelledby={`mode-tab-${mode}`}
    >
      <SatelliteTown reducedMotion={reducedMotion} />
      <p className="sr-only">
        Wellesley College, Tower Court to Clapp Library. Illustrative. Mode{' '}
        {mode}.
      </p>
    </section>
  )
}
