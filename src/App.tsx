import { useEffect, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { CompareSheet } from './components/CompareSheet'
import { ListFallback } from './components/ListFallback'
import { ModeToolbar } from './components/ModeToolbar'
import { ProposeSheet } from './components/ProposeSheet'
import { TopBar } from './components/TopBar'
import { fetchBarriers, getDemoScenario, tryCompareByIds } from './data/api'
import { interventionsForBarrier, LOCATIONS } from './data/fixtures'
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

  return (
    <div className={`app-shell${reducedMotion ? ' is-reduced-motion' : ''}`}>
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
      />

      <main
        id="stage"
        className="app-shell__main"
        role="tabpanel"
        aria-labelledby={`mode-tab-${mode}`}
      >
        {surfaceView === 'canvas' ? (
          <CanvasSlot mode={mode} reducedMotion={reducedMotion} />
        ) : (
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
      </main>

      {mode === 'compare' && <CompareSheet />}
      {mode === 'propose' && <ProposeSheet />}

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
