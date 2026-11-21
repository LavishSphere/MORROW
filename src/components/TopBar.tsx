import { LogoMark } from '../brand/LogoMark'
import { LocationSelector } from './LocationSelector'
import type { LocationOption, SurfaceView } from '../types'

type Props = {
  locations: LocationOption[]
  selectedLocationId: string
  onLocationSelect: (id: string) => void
  reducedMotion: boolean
  onReducedMotionChange: (value: boolean) => void
  surfaceView: SurfaceView
  onSurfaceViewChange: (view: SurfaceView) => void
}

export function TopBar({
  locations,
  selectedLocationId,
  onLocationSelect,
  reducedMotion,
  onReducedMotionChange,
  surfaceView,
  onSurfaceViewChange,
}: Props) {
  return (
    <header className="top-bar flex w-full flex-col items-center justify-center text-center">
      <div className="top-bar__brand-block">
        <div className="top-bar__lockup">
          <LogoMark decorative className="top-bar__mark" />
          <p className="top-bar__wordmark">MORROW</p>
        </div>
        <p className="top-bar__promise">Make tomorrow possible.</p>
      </div>

      <div className="top-bar__controls">
        <LocationSelector
          locations={locations}
          selectedId={selectedLocationId}
          onSelect={onLocationSelect}
        />

        <div
          className="view-toggle"
          role="group"
          aria-label="Neighborhood view"
        >
          <button
            type="button"
            className={surfaceView === 'canvas' ? 'is-active' : undefined}
            aria-pressed={surfaceView === 'canvas'}
            onClick={() => onSurfaceViewChange('canvas')}
          >
            Canvas
          </button>
          <button
            type="button"
            className={surfaceView === 'list' ? 'is-active' : undefined}
            aria-pressed={surfaceView === 'list'}
            onClick={() => onSurfaceViewChange('list')}
          >
            List (2D)
          </button>
        </div>

        <label className="motion-toggle">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => onReducedMotionChange(e.target.checked)}
          />
          <span>Reduced motion</span>
        </label>
      </div>
    </header>
  )
}
