import { useEffect, useState } from 'react'
import {
  PATCH_DESCRIPTION,
  draftForPothole,
  potholeById,
  usePotholeFix,
} from '../city/potholeFix'
import {
  compareByIds,
  generateProposal,
  getDemoIntervention,
  getDemoScenario,
} from '../data/api'
import { formatImprovement, formatMeters } from '../satellite/stats/format'
import type { DraftProposal, GenerateProposalResponse } from '../types'
import { buildTemplateDraft } from '../data/templateProposal'
import { chosenFacts, useIssueState } from '../showcase/issueStore'
import { ProposalEditor } from './ProposalEditor'
import { ProposalIssuePicker } from './ProposalIssues'
import { printProposal } from './printProposal'

/**
 * Propose stays on the scene without covering it.
 * When the API is down, generateProposal returns the labeled template.
 */
export function ProposeSheet() {
  const fix = usePotholeFix()
  const hole = potholeById(fix.selectedId)
  const patched = hole ? fix.patchedIds.includes(hole.id) : false
  const scenario = getDemoScenario()
  const intervention = getDemoIntervention()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateProposalResponse | null>(null)
  const [baseDraft, setBaseDraft] = useState<DraftProposal | null>(null)
  const [draft, setDraft] = useState<DraftProposal | null>(null)
  const { chosen, serverKnown } = useIssueState()

  useEffect(() => {
    if (!baseDraft) return
    setDraft(draftForPothole(baseDraft, hole, patched))
  }, [baseDraft, hole, patched])

  let beforeMeters: number | null = null
  let afterMeters: number | null = null
  let modeled = true
  try {
    const compared = compareByIds({
      scenarioId: scenario.id,
      interventionId: scenario.interventionId,
    })
    beforeMeters = compared.beforeMeters
    afterMeters = compared.afterMeters
  } catch {
    modeled = false
  }

  const onGenerate = async () => {
    setLoading(true)
    try {
      const issueIds = serverKnown ? [...chosen] : []
      let next = await generateProposal({
        scenarioId: scenario.id,
        barrierId: scenario.barrierId,
        interventionId: scenario.interventionId,
        ...(issueIds.length > 0 ? { issueIds } : {}),
      })
      // The issues the resident picked must be in the proposal. If the server
      // did not fold them in (an older API, the offline template, or a loaded
      // city it does not have), add them from the same shared code here.
      const wanted = chosenFacts()
      if (wanted.length > 0 && !(next.facts.issues && next.facts.issues.length > 0)) {
        const facts = { ...next.facts, issues: wanted }
        next = {
          ...next,
          facts,
          draft: next.aiGenerated ? next.draft : buildTemplateDraft(facts),
          warnings: [
            ...next.warnings,
            next.aiGenerated
              ? 'The selected issues are listed below but were not part of the Gemini draft.'
              : 'Selected issues were added to the template in the browser.',
          ],
        }
      }
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
            {hole
              ? `${hole.label}. ${patched ? 'Patched in this demo.' : 'Not patched yet.'} `
              : null}
            {scenario.originLabel} to {scenario.destinationLabel}.
          </p>
        </div>
        <button
          type="button"
          className="propose-sheet__generate"
          onClick={onGenerate}
          disabled={loading}
        >
          {loading ? 'Generating…' : result ? 'Regenerate' : 'Generate proposal'}
        </button>
      </header>

      <ProposalIssuePicker />

      {!(result && draft) && (
        <>
          {hole && (
            <p className="propose-sheet__change">{PATCH_DESCRIPTION}</p>
          )}
          {intervention && (
            <p className="propose-sheet__change">{intervention.description}</p>
          )}
          {modeled ? (
            <>
              <dl className="propose-brief__meters">
                <div>
                  <dt>Before</dt>
                  <dd>{formatMeters(beforeMeters)}</dd>
                </div>
                <div>
                  <dt>After</dt>
                  <dd>{formatMeters(afterMeters)}</dd>
                </div>
              </dl>
              <p className="propose-sheet__delta">
                {formatImprovement(beforeMeters, afterMeters)}. Not a Gemini
                estimate.
              </p>
            </>
          ) : (
            <p>Modeled route unavailable.</p>
          )}
          <p className="propose-sheet__note">
            Uses the illustrative Wellesley scenario. If the API is down, the
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
