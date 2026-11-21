import { useEffect, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { ContextPanel } from './components/ContextPanel'
import { ModeToolbar } from './components/ModeToolbar'
import { TopBar } from './components/TopBar'
import { fetchBarriers, getDemoScenario } from './data/api'
import {
  getIntervention,
  interventionsForBarrier,
  LOCATIONS,
} from './data/fixtures'
import type { AppMode, Barrier, Intervention } from './types'

export default function App() {
  const scenario = getDemoScenario()
  const [mode, setMode] = useState<AppMode>('explore')
  const [locationId, setLocationId] = useState('wellesley')
  const [barriers, setBarriers] = useState<Barrier[]>([])
  const [dataNote, setDataNote] = useState('Loading fixtures…')
  const [selectedBarrierId, setSelectedBarrierId] = useState<string | null>(
    scenario.barrierId,
  )
  const [selectedInterventionId, setSelectedInterventionId] = useState<
    string | null
  >(scenario.interventionId)
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  useEffect(() => {
    let cancelled = false
    fetchBarriers().then((result) => {
      if (cancelled) return
      setBarriers(result.barriers)
      setDataNote(result.note)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedBarrier =
    barriers.find((b) => b.id === selectedBarrierId) ?? null
  const interventions = selectedBarrier
    ? interventionsForBarrier(selectedBarrier.id)
    : []
  const selectedIntervention: Intervention | null = selectedInterventionId
    ? (getIntervention(selectedInterventionId) ?? null)
    : null
  const location = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0]

  return (
    <div className={`app-shell${reducedMotion ? ' is-reduced-motion' : ''}`}>
      <a className="skip-link" href="#context-panel">
        Skip to context panel
      </a>
      <a className="skip-link skip-link--modes" href="#mode-toolbar">
        Skip to modes
      </a>
      <TopBar
        locations={LOCATIONS}
        selectedLocationId={locationId}
        onLocationSelect={setLocationId}
        reducedMotion={reducedMotion}
        onReducedMotionChange={setReducedMotion}
      />
      <main className="app-shell__main">
        <CanvasSlot
          mode={mode}
          reducedMotion={reducedMotion}
          locationLabel={location.label}
          focusLabel={
            selectedBarrier
              ? `Focus: ${selectedBarrier.locationLabel}`
              : undefined
          }
        />
        <ContextPanel
          mode={mode}
          barriers={barriers}
          selectedBarrier={selectedBarrier}
          interventions={interventions}
          selectedIntervention={
            selectedIntervention?.barrierId === selectedBarrier?.id
              ? selectedIntervention
              : null
          }
          dataNote={dataNote}
          onSelectBarrier={(id) => {
            setSelectedBarrierId(id)
            const opts = interventionsForBarrier(id)
            setSelectedInterventionId(opts[0]?.id ?? null)
          }}
          onSelectIntervention={setSelectedInterventionId}
        />
      </main>
      <ModeToolbar
        mode={mode}
        onModeChange={setMode}
        reducedMotion={reducedMotion}
      />
    </div>
  )
}
