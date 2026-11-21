import { LocationSelector } from './LocationSelector'
import type { LocationOption } from '../types'

type Props = {
  locations: LocationOption[]
  selectedLocationId: string
  onLocationSelect: (id: string) => void
  reducedMotion: boolean
  onReducedMotionChange: (value: boolean) => void
}

export function TopBar({
  locations,
  selectedLocationId,
  onLocationSelect,
  reducedMotion,
  onReducedMotionChange,
}: Props) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand-block">
        <p className="top-bar__wordmark">MORROW</p>
        <p className="top-bar__promise">Make tomorrow possible.</p>
      </div>
      <div className="top-bar__controls">
        <LocationSelector
          locations={locations}
          selectedId={selectedLocationId}
          onSelect={onLocationSelect}
        />
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
