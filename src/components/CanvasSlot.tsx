import { ShowcaseCanvas } from '../showcase/ShowcaseCanvas'
import { useEffect, useMemo } from 'react'
import { setPlaceLabel } from '../showcase/cityStore'
import { neighborhoodGeoJson, type LoadedNeighborhood } from '../data/overpass'
import { useCityStreaming } from '../data/useCityStreaming'
import type { AppMode } from '../types'
import { Minimap } from './Minimap'
import { MoveHints } from './MoveHints'
import { PotholePopup } from './PotholePopup'

type Props = {
  mode: AppMode
  reducedMotion: boolean
  neighborhood: LoadedNeighborhood | null
  /** More of the loaded city arrived as the resident explored. */
  onNeighborhood: (next: LoadedNeighborhood) => void
}

/** Glass city between the top bar and the mode bar. */
export function CanvasSlot({ mode, reducedMotion, neighborhood, onNeighborhood }: Props) {
  useCityStreaming(neighborhood, onNeighborhood)
  const place = neighborhood?.place.label ?? 'Wellesley College'
  useEffect(
    () =>
      setPlaceLabel(
        neighborhood?.place.label ?? 'Wellesley, MA',
        neighborhood?.place.town ?? neighborhood?.place.label ?? 'Wellesley, MA',
      ),
    [neighborhood],
  )
  // A loaded place rebuilds the glass city. Without one, the Wellesley showcase stays.
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
      <PotholePopup />
      <Minimap placeLabel={neighborhood?.place.label ?? 'Wellesley, MA'} />
      <MoveHints />
      <p className="sr-only">
        {place}. Illustrative when the Wellesley scenario is showing. Mode {mode}.
      </p>
    </section>
  )
}
