import { useEffect, useRef } from 'react'
import {
  PATCH_DESCRIPTION,
  clearPothole,
  patchPothole,
  potholeById,
  usePotholeFix,
} from '../city/potholeFix'

/** Popup for the pothole that was clicked on the glass city. */
export function PotholePopup() {
  const fix = usePotholeFix()
  const hole = potholeById(fix.selectedId)
  const patched = hole ? fix.patchedIds.includes(hole.id) : false
  const actionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    actionRef.current?.focus()
  }, [hole?.id, patched])

  if (!hole) return null

  return (
    <div className="pothole-popup" role="dialog" aria-labelledby="pothole-popup-title">
      <p className="pothole-popup__kicker">Illustrative street issue</p>
      <h2 id="pothole-popup-title">{hole.label}</h2>
      <p>Not a surveyed defect.</p>
      <p>{PATCH_DESCRIPTION}</p>
      <div className="pothole-popup__actions">
        {patched ? (
          <p className="pothole-popup__done">Patched. The lane is even in this demo.</p>
        ) : (
          <button
            ref={actionRef}
            type="button"
            className="pothole-popup__patch"
            onClick={() => patchPothole(hole.id)}
          >
            Patch it
          </button>
        )}
        <button
          ref={patched ? actionRef : undefined}
          type="button"
          className="pothole-popup__close"
          onClick={() => clearPothole()}
        >
          Close
        </button>
      </div>
    </div>
  )
}
