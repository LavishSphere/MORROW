import { useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { ModeToolbar } from './components/ModeToolbar'
import { ShellPanel } from './components/ShellPanel'
import { TopBar } from './components/TopBar'
import { LOCATIONS, SCENARIO } from './data/fixtures'
import type { AppMode } from './types'

export default function App() {
  const [mode, setMode] = useState<AppMode>('explore')
  const [locationId, setLocationId] = useState('wellesley')
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
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
          focusLabel={`Scenario ${SCENARIO.id}`}
        />
        <ShellPanel
          mode={mode}
          dataNote="Bundled Wellesley fixtures loaded. Context details land in follow-up PRs."
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
