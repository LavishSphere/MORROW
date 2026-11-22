import {
  PATCH_DESCRIPTION,
  patchPothole,
  potholeById,
  usePotholeFix,
} from '../city/potholeFix'
import type { Barrier, Intervention } from '../types'

type Props = {
  barrier: Barrier | null
  interventions: Intervention[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Improve is the intervention list. The map stays on Explore. */
export function ImprovePage({
  barrier,
  interventions,
  selectedId,
  onSelect,
}: Props) {
  const fix = usePotholeFix()
  const hole = potholeById(fix.selectedId)
  const patched = hole ? fix.patchedIds.includes(hole.id) : false
  return (
    <section className="mode-page" aria-label="Intervention options">
      <h2>Options</h2>
      {hole && (
        <>
          <p className="mode-page__lead">
            <strong>{hole.label}</strong>. Illustrative pothole, not a surveyed
            defect.
          </p>
          <ul className="option-list">
            <li>
              <button
                type="button"
                className={`option-list__item${patched ? ' is-active' : ''}`}
                aria-pressed={patched}
                onClick={() => patchPothole(hole.id)}
              >
                <span className="option-list__name">{PATCH_DESCRIPTION}</span>
                <span className="option-list__meta">{patched ? 'patched' : 'patch'}</span>
              </button>
            </li>
          </ul>
        </>
      )}
      {!barrier ? (
        <p className="mode-page__lead">
          The Wellesley barrier is not loaded yet.
        </p>
      ) : (
        <>
          <p className="mode-page__lead">
            Interventions for <strong>{barrier.locationLabel}</strong>
          </p>
          <ul className="option-list">
            {interventions.map((opt) => {
              const active = opt.id === selectedId
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    className={`option-list__item${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => onSelect(opt.id)}
                  >
                    <span className="option-list__name">{opt.description}</span>
                    <span className="option-list__meta">{opt.type}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {interventions.length === 0 && (
            <p className="muted">No interventions for this barrier yet.</p>
          )}
        </>
      )}
    </section>
  )
}
