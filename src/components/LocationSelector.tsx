import type { LocationOption } from '../types'

type Props = {
  locations: LocationOption[]
  selectedId: string
  onSelect: (id: string) => void
}

export function LocationSelector({ locations, selectedId, onSelect }: Props) {
  return (
    <div className="location-selector">
      <label className="location-selector__label" htmlFor="location-select">
        Location
      </label>
      <select
        id="location-select"
        className="location-selector__select"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        aria-describedby="location-hint"
      >
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id} disabled={!loc.available}>
            {loc.label}
            {loc.featured ? ' (featured)' : ''}
            {!loc.available ? ' — coming later' : ''}
          </option>
        ))}
      </select>
      <p id="location-hint" className="location-selector__hint">
        Wellesley showcase only in Phase 1.
      </p>
    </div>
  )
}
