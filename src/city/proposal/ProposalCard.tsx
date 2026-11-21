import { useId, useMemo, useState } from 'react'
import { draftFromFix } from './draftFromFix'
import { stubGeminiCostEstimate } from './geminiCost'
import { improvementLine } from './improvement'
import type { Issue } from './issue'
import './proposal.css'

const buttonClass =
  'cursor-pointer rounded-lg border border-white bg-black px-3 py-2 text-center text-[0.9rem] leading-none font-bold text-white hover:shadow-[inset_0_0_0_1px_#ffffff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white disabled:cursor-default disabled:text-white disabled:opacity-45 motion-reduce:transition-none'

export type ProposalCardProps = {
  issue: Issue
  /** 0 while the street is changing, 1 when the fix has finished. */
  progress: number
  onNext: () => void
}

/**
 * Short card for one street issue.
 * Until the fix finishes, it asks you to watch. Afterward it shows what
 * changed, the improvement, and a Gemini cost stub that does not call Gemini.
 */
export function ProposalCard({ issue, progress, onNext }: ProposalCardProps) {
  const titleId = useId()
  const finished = progress >= 1
  const [cycle, setCycle] = useState({ id: issue.id, finished, token: 0 })
  const [draft, setDraft] = useState<{
    id: string
    token: number
    text: string
  } | null>(null)
  const [failure, setFailure] = useState<{
    id: string
    token: number
    text: string
  } | null>(null)
  const [pending, setPending] = useState<{ id: string; token: number } | null>(
    null,
  )
  const improvement = useMemo(() => improvementLine(issue), [issue])
  const estimate = stubGeminiCostEstimate(issue)

  if (cycle.id !== issue.id || cycle.finished !== finished) {
    const reset = cycle.id !== issue.id || (cycle.finished && !finished)
    setCycle({
      id: issue.id,
      finished,
      token: reset ? cycle.token + 1 : cycle.token,
    })
    if (reset) setPending(null)
  }

  const summary =
    finished && draft?.id === issue.id && draft.token === cycle.token
      ? draft.text
      : null
  const error =
    finished && failure?.id === issue.id && failure.token === cycle.token
      ? failure.text
      : null
  const busy = pending?.id === issue.id && pending.token === cycle.token

  const onGenerate = () => {
    if (!finished || busy) return
    const issueId = issue.id
    const token = cycle.token
    setPending({ id: issueId, token })
    setFailure(null)
    void draftFromFix(issue).then(
      (text) => {
        setPending((current) =>
          current?.id === issueId && current.token === token ? null : current,
        )
        setDraft({ id: issueId, token, text })
      },
      () => {
        setPending((current) =>
          current?.id === issueId && current.token === token ? null : current,
        )
        setFailure({
          id: issueId,
          token,
          text: 'Could not draft this proposal.',
        })
      },
    )
  }

  return (
    <article
      className="mx-auto box-border flex w-full max-w-xl flex-col items-center rounded-xl border border-white/35 bg-[rgba(4,18,24,0.92)] px-3.5 py-3 text-center font-[Source_Sans_3,Segoe_UI,sans-serif] text-white [&_*]:text-white"
      aria-labelledby={titleId}
    >
      <h2
        id={titleId}
        className="m-0 w-full text-center font-[Bricolage_Grotesque,Georgia,serif] text-xl leading-tight font-bold text-white"
      >
        {issue.title}
      </h2>
      <div className="w-full text-center" aria-live="polite">
        {finished ? (
          <>
            <p className="mt-2 w-full text-center text-[0.95rem] leading-snug text-white">
              <span className="mb-0.5 block text-center text-xs leading-tight font-bold tracking-[0.08em] text-white uppercase">
                What changed
              </span>
              {issue.fix}
            </p>
            <p className="mt-2 w-full text-center text-[0.95rem] leading-snug text-white">
              <span className="mb-0.5 block text-center text-xs leading-tight font-bold tracking-[0.08em] text-white uppercase">
                Improvement
              </span>
              {improvement}
            </p>
            <p className="mt-2.5 flex w-full flex-col items-center text-center text-white">
              <span className="text-[1.35rem] leading-none font-bold tracking-tight text-white tabular-nums">
                {estimate.display}
              </span>
              <span className="mt-0.5 text-[0.95rem] leading-tight font-medium text-white">
                {estimate.label}
              </span>
            </p>
          </>
        ) : (
          <p className="mt-2 w-full text-center text-[0.95rem] leading-snug text-white">
            Watch the street change.
          </p>
        )}
      </div>
      <div className="mt-2.5 flex w-full flex-wrap items-center justify-center gap-2">
        <button type="button" className={buttonClass} onClick={onNext}>
          See next problem
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={onGenerate}
          disabled={!finished || busy}
        >
          {busy ? 'Writing proposal…' : 'Generate proposal'}
        </button>
      </div>
      {summary ? (
        <p className="mt-2 w-full text-center text-[0.95rem] leading-snug text-white">
          {summary}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 w-full text-center text-[0.95rem] leading-snug text-white">
          {error}
        </p>
      ) : null}
    </article>
  )
}
