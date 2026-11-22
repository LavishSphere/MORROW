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
    </section>
  )
}
