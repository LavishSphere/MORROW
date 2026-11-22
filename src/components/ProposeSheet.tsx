import { useEffect, useMemo, useState } from 'react'
import {
  PATCH_DESCRIPTION,
  draftForPothole,
  potholeById,
  usePotholeFix,
} from '../city/potholeFix'
import {
  draftForStreetImprovements,
  improvementsByIds,
  useStreetImprovements,
} from '../city/streetImprovements'
import {
  compareByIds,
  generateProposal,
  getDemoIntervention,
  getDemoScenario,
} from '../data/api'
import { formatImprovement, formatMeters } from '../satellite/stats/format'
import type { DraftProposal, GenerateProposalResponse } from '../types'
import { ProposalEditor } from './ProposalEditor'

/**
 * Propose stays on the scene without covering it.
 * When the API is down, generateProposal returns the labeled template.
 */
export function ProposeSheet() {
  const fix = usePotholeFix()
  const hole = potholeById(fix.selectedId)
  const patched = hole ? fix.patchedIds.includes(hole.id) : false
  const { selectedIds } = useStreetImprovements()
  const improvements = useMemo(() => improvementsByIds(selectedIds), [selectedIds])
  const scenario = getDemoScenario()
  const intervention = getDemoIntervention()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateProposalResponse | null>(null)
  const [baseDraft, setBaseDraft] = useState<DraftProposal | null>(null)
  const [draft, setDraft] = useState<DraftProposal | null>(null)

  useEffect(() => {
    if (!baseDraft) return
    setDraft(
      draftForStreetImprovements(draftForPothole(baseDraft, hole, patched), improvements),
    )
  }, [baseDraft, hole, patched, improvements])

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
      const next = await generateProposal({
        scenarioId: scenario.id,
        barrierId: scenario.barrierId,
        interventionId: scenario.interventionId,
      })
      setResult(next)
      setBaseDraft(next.draft)
      setDraft(
        draftForStreetImprovements(draftForPothole(next.draft, hole, patched), improvements),
      )
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
            {improvements.length > 0
              ? ` Includes: ${improvements.map((item) => item.name).join(', ')}.`
              : null}
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
          onExportPdf={() => window.print()}
        />
      )}
    </section>
  )
}
