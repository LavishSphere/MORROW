import type { LoadedNeighborhood } from '../data/overpass'
import { ShowcaseCanvas } from '../showcase/ShowcaseCanvas'
import type { AppMode } from '../types'

type Props = {
  mode: AppMode
  reducedMotion: boolean
  neighborhood: LoadedNeighborhood | null
}

/** Glass city between the top bar and the mode bar. */
export function CanvasSlot({ mode, reducedMotion, neighborhood }: Props) {
  const place = neighborhood?.place.label ?? 'Wellesley College'
  return (
    <section
      className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
      aria-label="Holographic city"
    >
      <ShowcaseCanvas reducedMotion={reducedMotion} barriers={[]} />
      <p className="sr-only">
        {place}. Glass city with curved roads and potholes. Mode {mode}.
      </p>
    </section>
  )
}
