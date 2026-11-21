import { EvidenceBadge } from './EvidenceBadge'
import type { CompareResult } from '../data/api'
import type { Barrier } from '../types'

type Props = {
  barriers: Barrier[]
  selectedBarrierId: string | null
  compare: CompareResult | null
  onSelectBarrier: (id: string) => void
}

function typeLabel(type: Barrier['type']): string {
  switch (type) {
    case 'missing_ramp':
      return 'Missing curb ramp'
    case 'unsafe_crossing':
      return 'Unsafe crossing'
    case 'blocked_path':
      return 'Blocked path'
  }
}

function formatMeters(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return 'Unreachable'
  return `${Math.round(meters).toLocaleString('en-US')} m`
}

function formatDelta(delta: number | null): string {
  if (delta == null || !Number.isFinite(delta)) return 'n/a'
  if (delta === 0) return '0 m'
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(Math.round(delta)).toLocaleString('en-US')} m`
}

/** Simple 2D / list alternative to the 3D canvas (MapLibre deferred). */
export function ListFallback({
  barriers,
  selectedBarrierId,
  compare,
  onSelectBarrier,
}: Props) {
  return (
    <section className="list-fallback" aria-label="2D list view">
      <header className="list-fallback__header">
        <h2 className="list-fallback__title">List view</h2>
        <p className="list-fallback__lead">
          Keyboard-friendly alternative while the 3D scene is reserved. MapLibre
          2D map is a later expansion.
        </p>
      </header>

      <table className="list-fallback__table">
        <caption className="sr-only">Wellesley bundled barriers</caption>
        <thead>
          <tr>
            <th scope="col">Location</th>
            <th scope="col">Type</th>
            <th scope="col">Evidence</th>
            <th scope="col">Coordinates</th>
          </tr>
        </thead>
        <tbody>
          {barriers.map((b) => {
            const selected = b.id === selectedBarrierId
            return (
              <tr
                key={b.id}
                className={selected ? 'is-selected' : undefined}
                aria-selected={selected}
              >
                <td>
                  <button
                    type="button"
                    className="list-fallback__link"
                    onClick={() => onSelectBarrier(b.id)}
                  >
                    {b.locationLabel}
                  </button>
                </td>
                <td>{typeLabel(b.type)}</td>
                <td>
                  <EvidenceBadge status={b.evidenceStatus} />
                </td>
                <td>
                  <code>
                    {b.coordinates[1].toFixed(4)}, {b.coordinates[0].toFixed(4)}
                  </code>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {compare && (
        <div className="list-fallback__compare" aria-live="polite">
          <h3>Modeled route</h3>
          <p>
            Before: <strong>{formatMeters(compare.beforeMeters)}</strong> →
            After: <strong>{formatMeters(compare.afterMeters)}</strong>. Delta:{' '}
            {formatDelta(compare.deltaMeters)}. Not a Gemini estimate.
          </p>
        </div>
      )}
    </section>
  )
}
