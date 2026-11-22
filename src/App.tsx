import { useEffect, useRef, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { CompareSheet } from './components/CompareSheet'
import { FlowNudge } from './components/FlowNudge'
import { ImprovePage } from './components/ImprovePage'
import { ModeToolbar } from './components/ModeToolbar'
import { OverlayPanel } from './components/OverlayPanel'
import { ProposeSheet } from './components/ProposeSheet'
import { TopBar } from './components/TopBar'
import { useChromeInsets } from './components/useChromeInsets'
import { useFlowNudge } from './components/useFlowNudge'
import { useIssueState } from './showcase/issueStore'
import type { LoadedNeighborhood } from './data/overpass'
import type { AppMode } from './types'

export default function App() {
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
  // "Next: Improve" and so on, pointing along Explore → Improve → Compare → Propose.
  const nudge = useFlowNudge(mode)
  // Clicking an issue marker in the city opens it in Improve.
  const { openImprove } = useIssueState()
  useEffect(() => {
    if (openImprove === 0) return
    setMode('improve')
    setPanelMode('improve')
  }, [openImprove])
  const [neighborhood, setNeighborhood] = useState<LoadedNeighborhood | null>(null)
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
    <div
      ref={shellRef}
      className={`app-shell app-shell--city${panelOpen ? ' has-panel' : ''}${nudge.step ? ' has-nudge' : ''}${reducedMotion ? ' is-reduced-motion' : ''}`}
    >
      <a className="skip-link" href="#mode-toolbar">
        Skip to modes
      </a>

      <TopBar
        reducedMotion={reducedMotion}
        onReducedMotionChange={setReducedMotion}
        onPlace={setNeighborhood}
        placeLabel={neighborhood?.place.label ?? 'Wellesley, MA'}
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
          onNeighborhood={setNeighborhood}
        />
        <OverlayPanel open={panelOpen} contentKey={panelMode}>
          {panelMode === 'improve' && (
            <ImprovePage />
          )}
          {panelMode === 'compare' && <CompareSheet />}
          {panelMode === 'propose' && <ProposeSheet />}
        </OverlayPanel>
        <FlowNudge step={nudge.step} onGo={changeMode} onClose={nudge.dismiss} />
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
