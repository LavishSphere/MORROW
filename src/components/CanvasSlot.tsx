import type { LoadedNeighborhood } from '../data/overpass'
import { SatelliteTown } from '../satellite/town/SatelliteTown'
import { ShowcaseCanvas } from '../showcase/ShowcaseCanvas'
import type { AppMode } from '../types'

type Props = {
  mode: AppMode
  reducedMotion: boolean
  neighborhood: LoadedNeighborhood | null
}

/**
 * Opening canvas is the isometric holographic glass city.
 * A typed US city replaces that view with the satellite loader.
 */
export function CanvasSlot({ mode, reducedMotion, neighborhood }: Props) {
  if (neighborhood == null) {
    return (
      <section
        className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
        aria-label="Holographic neighborhood"
      >
        <ShowcaseCanvas barriers={[]} reducedMotion={reducedMotion} />
        <p className="sr-only">
          Illustrative holographic city. Glass buildings, streets, and mixed
          trees. Mode {mode}.
        </p>
      </section>
    )
  }

  return (
    <section
      className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
      aria-label="Satellite view"
    >
      <SatelliteTown reducedMotion={reducedMotion} neighborhood={neighborhood} />
      <p className="sr-only">
        {neighborhood.place.label}. Streets from OpenStreetMap, not a barrier
        inventory. Mode {mode}.
      </p>
    </section>
  )
}
