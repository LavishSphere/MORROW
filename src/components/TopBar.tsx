import { LogoMark } from '../brand/LogoMark'
import { AddressJump } from './AddressJump'
import { PlaceSearch } from './PlaceSearch'
import type { LoadedNeighborhood } from '../data/overpass'

type Props = {
  reducedMotion: boolean
  onReducedMotionChange: (value: boolean) => void
  onPlace: (neighborhood: LoadedNeighborhood) => void
  /** The city on screen: Wellesley, or the one the resident loaded. */
  placeLabel: string
}

export function TopBar({ reducedMotion, onReducedMotionChange, onPlace, placeLabel }: Props) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand-block">
        {/* Decorative: the wordmark beside it already says MORROW. */}
        <LogoMark decorative className="top-bar__logo" />
        <p className="top-bar__wordmark">MORROW</p>
        <p className="top-bar__promise">Make tomorrow possible.</p>
        <p className="top-bar__place" aria-label={`Showing ${placeLabel}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
          </svg>
          <span>{placeLabel}</span>
        </p>
      </div>

      <div className="top-bar__controls">
        <AddressJump onLoad={onPlace} />
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
