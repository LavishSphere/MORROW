import { useEffect, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { ListFallback } from './components/ListFallback'
import { ModeToolbar } from './components/ModeToolbar'
import { ProposeSheet } from './components/ProposeSheet'
import { TopBar } from './components/TopBar'
import { compareByIds, fetchBarriers, getDemoScenario } from './data/api'
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

  let compare = null
  if (selectedInterventionId) {
    try {
      compare = compareByIds({
        scenarioId: scenario.id,
        interventionId: selectedInterventionId,
      })
    } catch {
      compare = null
    }
  }

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
        <div className="dream-sky" aria-hidden="true">
          <span className="dream-sky__cloud dream-sky__cloud--one" />
          <span className="dream-sky__cloud dream-sky__cloud--two" />
          <span className="dream-sky__cloud dream-sky__cloud--three" />
          <span className="dream-sky__cloud dream-sky__cloud--four" />
          <span className="dream-sky__sparkle dream-sky__sparkle--a" />
          <span className="dream-sky__sparkle dream-sky__sparkle--b" />
          <span className="dream-sky__sparkle dream-sky__sparkle--c" />
          <span className="dream-sky__glow" />
        </div>
      </main>

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
