import type { CompareResult } from '../data/api'
import { SatelliteTown } from '../satellite/town/SatelliteTown'
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

/**
 * The neighborhood canvas is the top-down satellite town.
 * Pins and See next problem come from the AI detection pass.
 */
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
      aria-label="Satellite view"
    >
      <SatelliteTown reducedMotion={reducedMotion} />
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