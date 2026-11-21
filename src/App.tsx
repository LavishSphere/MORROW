import { useEffect, useState } from 'react'
import { CanvasSlot } from './components/CanvasSlot'
import { ModeToolbar } from './components/ModeToolbar'
import { ProposeSheet } from './components/ProposeSheet'
import type { AppMode } from './types'

export default function App() {
  const [mode, setMode] = useState<AppMode>('explore')
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
    <div className={`app-shell app-shell--bleed${reducedMotion ? ' is-reduced-motion' : ''}`}>
      <a className="skip-link" href="#mode-toolbar">
        Skip to modes
      </a>

      <main className="app-shell__stage">
        <CanvasSlot mode={mode} reducedMotion={reducedMotion} />
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
