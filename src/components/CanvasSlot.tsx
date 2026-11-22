import { ShowcaseCanvas } from '../showcase/ShowcaseCanvas'
import { useMemo } from 'react'
import { neighborhoodGeoJson, type LoadedNeighborhood } from '../data/overpass'
import type { AppMode } from '../types'
import { Minimap } from './Minimap'
import { MoveHints } from './MoveHints'
type Props = {
  mode: AppMode
  reducedMotion: boolean
  neighborhood: LoadedNeighborhood | null
}

/** Glass city between the top bar and the mode bar. */
export function CanvasSlot({ mode, reducedMotion, neighborhood }: Props) {
  const place = neighborhood?.place.label ?? 'Wellesley College'
  // A loaded city rebuilds the glass city from its OpenStreetMap streets
  // and buildings. Without one, the Wellesley showcase stays.
  const geoJson = useMemo(
    () =>
      neighborhood && neighborhood.ways.length > 0
        ? neighborhoodGeoJson(neighborhood)
        : undefined,
    [neighborhood],
  )
  return (
    <section
      className={`canvas-slot${reducedMotion ? ' is-reduced' : ''}`}
      aria-label="Holographic city"
    >
      <ShowcaseCanvas reducedMotion={reducedMotion} barriers={[]} geoJson={geoJson} />
      <Minimap placeLabel={neighborhood?.place.label ?? 'Wellesley, MA'} />
      <MoveHints />
      <p className="sr-only">
        {place}. Illustrative when the Wellesley scenario is showing. Mode {mode}.
      </p>
    </section>
  )
}
