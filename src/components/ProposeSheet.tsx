import { useEffect, useState } from 'react'
import {
  PATCH_DESCRIPTION,
  draftForPothole,
  potholeById,
  usePotholeFix,
} from '../city/potholeFix'
import { generateProposal } from '../data/api'
import { useCityState } from '../showcase/cityStore'
import { chosenFacts, useIssueState } from '../showcase/issueStore'
import type { DraftProposal, GenerateProposalResponse } from '../types'
import { ProposalEditor } from './ProposalEditor'
import { ProposalIssuePicker } from './ProposalIssues'
import { printProposal } from './printProposal'

/**
 * Propose: one proposal for the issues the resident picked on the map.
 * The API re-checks the issues by id and asks Gemini to write it; when the
 * API cannot (offline, or a loaded city it does not have), the same facts
 * are drafted in the browser and labeled as a template.
 */
export function ProposeSheet() {
  const fix = usePotholeFix()
  const hole = potholeById(fix.selectedId)
  const patched = hole ? fix.patchedIds.includes(hole.id) : false
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateProposalResponse | null>(null)
  const [baseDraft, setBaseDraft] = useState<DraftProposal | null>(null)
  const [draft, setDraft] = useState<DraftProposal | null>(null)
  const { chosen, serverKnown } = useIssueState()
  const { placeLabel } = useCityState()
  const count = chosen.size

  useEffect(() => {
    if (!baseDraft) return
    setDraft(draftForPothole(baseDraft, hole, patched))
  }, [baseDraft, hole, patched])

  const onGenerate = async () => {
    if (count === 0) return
    setLoading(true)
    try {
      const next = await generateProposal({
        ...(serverKnown ? { issueIds: [...chosen] } : {}),
        localIssues: chosenFacts(),
        city: placeLabel,
      })
      setResult(next)
      setBaseDraft(next.draft)
      setDraft(draftForPothole(next.draft, hole, patched))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mode-page propose-sheet" aria-label="Proposal">
      <header className="propose-sheet__head">
        <div>
          <h2 className="propose-sheet__title">Proposal</h2>
          <p className="propose-sheet__lead">
            {count === 0
              ? `Pick issues in ${placeLabel} to propose.`
              : `${count} issue${count === 1 ? '' : 's'} in ${placeLabel}.`}
          </p>
        </div>
        <button
          type="button"
          className="propose-sheet__generate"
          onClick={onGenerate}
          disabled={loading || count === 0}
        >
          {loading ? 'Generating…' : result ? 'Regenerate' : 'Generate proposal'}
        </button>
      </header>

      <ProposalIssuePicker />

      {!(result && draft) && (
        <>
          {hole && <p className="propose-sheet__change">{PATCH_DESCRIPTION}</p>}
          <p className="propose-sheet__note">
            Gemini writes the draft from facts the server re-checks. If the API is down, the
            draft is the template and Gemini stays labeled unavailable.
          </p>
        </>
      )}

      {result && draft && (
        <ProposalEditor
          facts={result.facts}
          draft={draft}
          warnings={result.warnings}
          aiGenerated={result.aiGenerated}
          geminiAvailable={result.geminiAvailable}
          apiAvailable={result.apiAvailable}
          onChange={setDraft}
          onExportPdf={printProposal}
        />
      )}
    </section>
  )
}
