import { useState } from 'react'
import { generateProposal, getDemoScenario } from '../data/api'
import type { DraftProposal, GenerateProposalResponse } from '../types'
import { ProposalEditor } from './ProposalEditor'

/**
 * Propose stays on the scene without covering it.
 * When the API is down, generateProposal returns the labeled template.
 */
export function ProposeSheet() {
  const scenario = getDemoScenario()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateProposalResponse | null>(null)
  const [draft, setDraft] = useState<DraftProposal | null>(null)

  const onGenerate = async () => {
    setLoading(true)
    try {
      const next = await generateProposal({
        scenarioId: scenario.id,
        barrierId: scenario.barrierId,
        interventionId: scenario.interventionId,
      })
      setResult(next)
      setDraft(next.draft)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mode-page propose-sheet" aria-label="Proposal">
      <button
        type="button"
        className="propose-sheet__generate"
        onClick={onGenerate}
        disabled={loading}
      >
        {loading ? 'Generating…' : 'Generate proposal'}
      </button>
      {result && draft ? (
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
      ) : (
        <p className="propose-sheet__note">
          Uses the illustrative Wellesley scenario. If the API is down, the
          draft is the template and Gemini stays labeled unavailable.
        </p>
      )}
    </section>
  )
}
