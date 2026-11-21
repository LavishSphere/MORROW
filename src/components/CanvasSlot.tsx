import { ShowcaseCanvas } from '../showcase/ShowcaseCanvas'
import {
  PLACEHOLDER_BARRIERS,
  PLACEHOLDER_ROUTE,
} from '../showcase/placeholder'
import '../showcase/styles.css'

type Props = {
  reducedMotion: boolean
  selectedBarrierId: string | null
  selectedInterventionId: string | null
  onSelectBarrier: (id: string) => void
  onSelectIntervention: (id: string) => void
}

export function CanvasSlot({
  reducedMotion,
  selectedBarrierId,
  selectedInterventionId,
  onSelectBarrier,
  onSelectIntervention,
}: Props) {
  return (
    <section className="canvas-slot" aria-label="Street view">
      <ShowcaseCanvas
        barriers={PLACEHOLDER_BARRIERS}
        routeGeometry={PLACEHOLDER_ROUTE}
        reducedMotion={reducedMotion}
        selectedBarrierId={selectedBarrierId}
        selectedInterventionId={selectedInterventionId}
        onSelectBarrier={onSelectBarrier}
        onSelectIntervention={onSelectIntervention}
      />
    </section>
  )
}
