import { LogoMark } from '../brand/LogoMark'
import { PlaceSearch } from './PlaceSearch'
import type { LoadedNeighborhood } from '../data/overpass'

type Props = {
  reducedMotion: boolean
  onReducedMotionChange: (value: boolean) => void
  onPlace: (neighborhood: LoadedNeighborhood) => void
}

export function TopBar({ reducedMotion, onReducedMotionChange, onPlace }: Props) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand-block">
        {/* Decorative: the wordmark beside it already says MORROW. */}
        <LogoMark decorative className="top-bar__logo" />
        <p className="top-bar__wordmark">MORROW</p>
        <p className="top-bar__promise">Make tomorrow possible.</p>
      </div>

      <div className="top-bar__controls">
        <PlaceSearch onLoad={onPlace} />

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
