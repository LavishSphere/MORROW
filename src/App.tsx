import { useEffect, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { CompareSheet } from './components/CompareSheet'
import { ImprovePage } from './components/ImprovePage'
import { ListFallback } from './components/ListFallback'
import { ModeToolbar } from './components/ModeToolbar'
import { ProposeSheet } from './components/ProposeSheet'
import { TopBar } from './components/TopBar'
import { fetchBarriers, getDemoScenario, tryCompareByIds } from './data/api'
import type { LoadedNeighborhood } from './data/overpass'
import {
  getBarrier,
  interventionsForBarrier,
  LOCATIONS,
} from './data/fixtures'
import type { AppMode, Barrier, SurfaceView } from './types'

export default function App() {
  const scenario = getDemoScenario()
  const [mode, setMode] = useState<AppMode>('explore')
  const [surfaceView, setSurfaceView] = useState<SurfaceView>('canvas')
  const [locationId, setLocationId] = useState('wellesley')
  const [barriers, setBarriers] = useState<Barrier[]>([])
  const [selectedBarrierId, setSelectedBarrierId] = useState<string | null>(
    scenario.barrierId,
  )
  const [selectedInterventionId, setSelectedInterventionId] = useState<
    string | null
  >(scenario.interventionId)
  const [neighborhood, setNeighborhood] = useState<LoadedNeighborhood | null>(null)
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    let cancelled = false
    fetchBarriers().then((result) => {
      if (cancelled) return
      setBarriers(result.barriers)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const compare = selectedInterventionId
    ? tryCompareByIds({
        scenarioId: scenario.id,
        interventionId: selectedInterventionId,
      })
    : null
  const selectedBarrier =
    barriers.find((barrier) => barrier.id === selectedBarrierId) ??
    (selectedBarrierId ? (getBarrier(selectedBarrierId) ?? null) : null)
  const interventions = selectedBarrier
    ? interventionsForBarrier(selectedBarrier.id)
    : []

  return (
    <div className={`app-shell app-shell--city${reducedMotion ? ' is-reduced-motion' : ''}`}>
      <a className="skip-link" href="#mode-toolbar">
        Skip to modes
      </a>

      <TopBar
        locations={LOCATIONS}
        selectedLocationId={locationId}
        onLocationSelect={setLocationId}
        reducedMotion={reducedMotion}
        onReducedMotionChange={setReducedMotion}
        surfaceView={surfaceView}
        onSurfaceViewChange={setSurfaceView}
        onPlace={setNeighborhood}
        onShowcase={() => setNeighborhood(null)}
      />

      <main
        id="stage"
        className="app-shell__main"
        role="tabpanel"
        aria-labelledby={`mode-tab-${mode}`}
      >
        {mode === 'explore' && surfaceView === 'canvas' && (
          <CanvasSlot
            mode={mode}
            reducedMotion={reducedMotion}
            neighborhood={neighborhood}
          />
        )}
        {mode !== 'explore' && (
          <CanvasSlot
            mode={mode}
            reducedMotion={reducedMotion}
            neighborhood={neighborhood}
          />
        )}
        {mode === 'explore' && surfaceView === 'list' && (
          <ListFallback
            barriers={barriers}
            selectedBarrierId={selectedBarrierId}
            compare={compare}
            onSelectBarrier={(id) => {
              setSelectedBarrierId(id)
              const opts = interventionsForBarrier(id)
              setSelectedInterventionId(opts[0]?.id ?? null)
            }}
          />
        )}
        {mode === 'improve' && (
          <ImprovePage
            barrier={selectedBarrier}
            interventions={interventions}
            selectedId={selectedInterventionId}
            onSelect={setSelectedInterventionId}
          />
        )}
        {mode === 'compare' && <CompareSheet />}
        {mode === 'propose' && <ProposeSheet />}
      </main>

      <div id="mode-toolbar">
        <ModeToolbar
          mode={mode}
          onModeChange={setMode}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  )
}
