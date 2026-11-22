import { potholeById, usePotholeFix } from '../city/potholeFix'
import { improvementsByIds, useStreetImprovements } from '../city/streetImprovements'
import { IssueComparisons } from './IssueComparisons'

/**
 * Compare: the city today versus with the resident's fixes, and what the
 * fixes are worth. There is no cost line here; a dollar figure would be a
 * Gemini stub.
 */
export function CompareSheet() {
  const fix = usePotholeFix()
  const hole = potholeById(fix.selectedId)
  const patched = hole ? fix.patchedIds.includes(hole.id) : false
  const improvements = improvementsByIds(useStreetImprovements().selectedIds)

  return (
    <section className="mode-page compare-sheet" aria-label="Modeled comparison">
      <IssueComparisons />
      {hole && (
        <>
          <h2 className="compare-sheet__title">{hole.label}</h2>
          <dl className="compare-sheet__meters">
            <div>
              <dt>Before</dt>
              <dd>Open</dd>
            </div>
            <div>
              <dt>After</dt>
              <dd>{patched ? 'Patched' : 'Open'}</dd>
            </div>
          </dl>
          <p>
            {patched
              ? 'The lane is even in this demo.'
              : 'Still open. Patch it from the city or from Improve.'}{' '}
            Not a Gemini estimate.
          </p>
        </>
      )}
      {improvements.length > 0 && (
        <>
          <h2 className="compare-sheet__title">Street improvements</h2>
          {improvements.map((item) => (
            <div key={item.id} className="compare-sheet__improvement">
              <p className="compare-sheet__note">{item.name}</p>
              <dl className="compare-sheet__meters" aria-label={item.name}>
                <div>
                  <dt>Before</dt>
                  <dd>None</dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>Proposed</dd>
                </div>
              </dl>
            </div>
          ))}
          <p>Illustrative only. Not a Gemini estimate.</p>
        </>
      )}
    </section>
  )
}
