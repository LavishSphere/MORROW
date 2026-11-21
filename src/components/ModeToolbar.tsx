import type { AppMode } from '../types'

const MODES: { id: AppMode; label: string; hint: string }[] = [
  { id: 'explore', label: 'Explore', hint: 'Browse nearby barriers' },
  { id: 'improve', label: 'Improve', hint: 'Choose an intervention' },
  { id: 'compare', label: 'Compare', hint: 'Before / after outcomes' },
  { id: 'propose', label: 'Propose', hint: 'Draft advocacy brief' },
]

type Props = {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
  reducedMotion: boolean
}

export function ModeToolbar({ mode, onModeChange, reducedMotion }: Props) {
  return (
    <nav
      className={`mode-toolbar${reducedMotion ? ' is-reduced' : ''}`}
      aria-label="App modes"
    >
      <div className="mode-toolbar__track" role="tablist" aria-orientation="horizontal">

        {MODES.map((item) => {
          const selected = item.id === mode
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`mode-tab-${item.id}`}
              className={`mode-toolbar__btn${selected ? ' is-active' : ''}`}
              aria-selected={selected}
              aria-controls="stage"
              tabIndex={selected ? 0 : -1}
              title={item.hint}
              onClick={() => onModeChange(item.id)}
              onKeyDown={(e) => {
                const order = MODES.map((m) => m.id)
                const idx = order.indexOf(item.id)
                let next: AppMode | null = null
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  next = order[(idx + 1) % order.length]
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  next = order[(idx - 1 + order.length) % order.length]
                } else if (e.key === 'Home') {
                  next = order[0]
                } else if (e.key === 'End') {
                  next = order[order.length - 1]
                }
                if (next) {
                  e.preventDefault()
                  onModeChange(next)
                  requestAnimationFrame(() => {
                    document.getElementById(`mode-tab-${next}`)?.focus()
                  })
                }
              }}
            >
              <span className="mode-toolbar__label">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
