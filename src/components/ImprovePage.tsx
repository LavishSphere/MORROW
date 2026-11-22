import {
  STREET_IMPROVEMENTS,
  toggleStreetImprovement,
  useStreetImprovements,
} from '../city/streetImprovements'
import {
  PATCH_DESCRIPTION,
  patchPothole,
  potholeById,
  usePotholeFix,
} from '../city/potholeFix'
import { IssueBrowser } from './IssueBrowser'

/** Improve: the map's accessibility issues, and the fix for each. */
export function ImprovePage() {
  const fix = usePotholeFix()
  const improvements = useStreetImprovements()
  const hole = potholeById(fix.selectedId)
  const patched = hole ? fix.patchedIds.includes(hole.id) : false
  return (
    <section className="mode-page" aria-label="Intervention options">
      <h2>Improve</h2>
      <IssueBrowser />
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
      <h2>Street improvements</h2>
      <p className="mode-page__lead">
        Illustrative ideas that improve the public realm. They do not change
        modeled route distance.
      </p>
      <ul className="option-list">
        {STREET_IMPROVEMENTS.map((item) => {
          const active = improvements.selectedIds.includes(item.id)
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`option-list__item${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleStreetImprovement(item.id)}
              >
                <span className="option-list__name">{item.name}</span>
                <span className="option-list__meta">
                  {item.description} · {active ? 'selected' : item.category}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
