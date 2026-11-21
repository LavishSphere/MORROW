import { useEffect, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { BARRIER_CURB_ID, INTERVENTION_RAMP_ID } from './showcase/layout'

export default function App() {
  const [selectedBarrierId, setSelectedBarrierId] = useState<string | null>(null)
  const [selectedInterventionId, setSelectedInterventionId] = useState<string | null>(
    null,
  )
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <div className={`app-shell app-shell--street${reducedMotion ? ' is-reduced-motion' : ''}`}>
      <CanvasSlot
        reducedMotion={reducedMotion}
        selectedBarrierId={selectedBarrierId}
        selectedInterventionId={selectedInterventionId}
        onSelectBarrier={(id) => {
          setSelectedBarrierId(id || BARRIER_CURB_ID)
        }}
        onSelectIntervention={(id) => {
          setSelectedInterventionId(id || INTERVENTION_RAMP_ID)
        }}
      />
    </div>
  )
}
