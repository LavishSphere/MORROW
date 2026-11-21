import { LocationSelector } from './LocationSelector'
import type { LocationOption, SurfaceView } from '../types'

const logoBlue = `${import.meta.env.BASE_URL}morrow-logo-blue.png`

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
    <header className="top-bar items-center justify-center">
      <div className="top-bar__brand-block flex items-center justify-center gap-3">
        <img
          src={logoBlue}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14"
        />
        <div className="flex flex-col items-center justify-center">
          <p className="top-bar__wordmark">MORROW</p>
          <p className="top-bar__promise">Make tomorrow possible.</p>
        </div>
      </div>

      <div className="top-bar__controls items-center justify-center">
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
