import { useEffect, useRef, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { CompareSheet } from './components/CompareSheet'
import { ImprovePage } from './components/ImprovePage'
import { ModeToolbar } from './components/ModeToolbar'
import { OverlayPanel } from './components/OverlayPanel'
import { ProposeSheet } from './components/ProposeSheet'
import { TopBar } from './components/TopBar'
import { useChromeInsets } from './components/useChromeInsets'
import { useIssueState } from './showcase/issueStore'
import { fetchBarriers, getDemoScenario } from './data/api'
import type { LoadedNeighborhood } from './data/overpass'
import { getBarrier, interventionsForBarrier } from './data/fixtures'
import type { AppMode, Barrier } from './types'

export default function App() {
  const scenario = getDemoScenario()
  const [mode, setMode] = useState<AppMode>('explore')
  // The page shown in the left panel. It outlives a switch back to Explore
  // so the panel can slide away with its content still inside.
  const [panelMode, setPanelMode] = useState<AppMode | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  useChromeInsets(shellRef)
  const changeMode = (next: AppMode) => {
    setMode(next)
    if (next !== 'explore') setPanelMode(next)
  }
  const panelOpen = mode !== 'explore'
  // Clicking an issue marker in the city opens it in Improve.
  const { openImprove } = useIssueState()
  useEffect(() => {
    if (openImprove === 0) return
    setMode('improve')
    setPanelMode('improve')
  }, [openImprove])
  const [barriers, setBarriers] = useState<Barrier[]>([])
  const [selectedBarrierId] = useState<string | null>(
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

  const selectedBarrier =
    barriers.find((barrier) => barrier.id === selectedBarrierId) ??
    (selectedBarrierId ? (getBarrier(selectedBarrierId) ?? null) : null)
  const interventions = selectedBarrier
    ? interventionsForBarrier(selectedBarrier.id)
    : []

  return (
    <div
      ref={shellRef}
      className={`app-shell app-shell--city${panelOpen ? ' has-panel' : ''}${reducedMotion ? ' is-reduced-motion' : ''}`}
    >
      <a className="skip-link" href="#mode-toolbar">
        Skip to modes
      </a>

      <TopBar
        reducedMotion={reducedMotion}
        onReducedMotionChange={setReducedMotion}
        onPlace={setNeighborhood}
      />

      <main
        id="stage"
        className="app-shell__main"
        role="tabpanel"
        aria-labelledby={`mode-tab-${mode}`}
      >
        {/* One canvas for every mode, so switching modes keeps the city
            mounted instead of rebuilding it behind the loading cover. */}
        <CanvasSlot
          mode={mode}
          reducedMotion={reducedMotion}
          neighborhood={neighborhood}
        />
        <OverlayPanel open={panelOpen} contentKey={panelMode}>
          {panelMode === 'improve' && (
            <ImprovePage
              barrier={selectedBarrier}
              interventions={interventions}
              selectedId={selectedInterventionId}
              onSelect={setSelectedInterventionId}
            />
          )}
          {panelMode === 'compare' && <CompareSheet />}
          {panelMode === 'propose' && <ProposeSheet />}
        </OverlayPanel>
      </main>

      <div id="mode-toolbar">
        <ModeToolbar
          mode={mode}
          onModeChange={changeMode}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  )
}
