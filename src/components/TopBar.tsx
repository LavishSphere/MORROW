import { LocationSelector } from './LocationSelector'
import { PlaceSearch } from './PlaceSearch'
import type { LoadedNeighborhood } from '../data/overpass'
import type { LocationOption, SurfaceView } from '../types'

type Props = {
  locations: LocationOption[]
  selectedLocationId: string
  onLocationSelect: (id: string) => void
  reducedMotion: boolean
  onReducedMotionChange: (value: boolean) => void
  surfaceView: SurfaceView
  onSurfaceViewChange: (view: SurfaceView) => void
  onPlace: (neighborhood: LoadedNeighborhood) => void
  onShowcase: () => void
}

export function TopBar({
  locations,
  selectedLocationId,
  onLocationSelect,
  reducedMotion,
  onReducedMotionChange,
  surfaceView,
  onSurfaceViewChange,
  onPlace,
  onShowcase,
}: Props) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand-block">
        <p className="top-bar__wordmark">MORROW</p>
        <p className="top-bar__promise">Make tomorrow possible.</p>
      </div>

      <div className="top-bar__controls">
        <PlaceSearch onLoad={onPlace} onShowcase={onShowcase} />
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
