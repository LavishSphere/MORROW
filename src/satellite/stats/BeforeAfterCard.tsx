import { useEffect, useId, useState } from 'react'
import { formatImprovement, formatMeters } from './format'
import {
  GEMINI_ESTIMATE_LABEL,
  buildStubGeminiCostEstimate,
  requestGeminiCostEstimate,
} from './geminiEstimate'
import type { GeminiCostEstimate } from './geminiEstimate'
import './stats.css'

export type BeforeAfterCardProps = {
  /** Modeled distance before the improvement. Null when the trip is unreachable. */
  beforeMeters: number | null
  /** Modeled distance after the improvement. Null when the trip is unreachable. */
  afterMeters: number | null
}

const EMPTY_ESTIMATE: GeminiCostEstimate = {
  label: GEMINI_ESTIMATE_LABEL,
  amountUsd: null,
  display: '—',
}

/**
 * Before/after improvement card. Distances are modeled inputs. The cost is
 * labeled "Gemini estimate" and comes from `requestGeminiCostEstimate`, a
 * stub until the app points it at a Gemini API call.
 */
export function BeforeAfterCard({
  beforeMeters,
  afterMeters,
}: BeforeAfterCardProps) {
  const titleId = useId()
  const [estimate, setEstimate] = useState<GeminiCostEstimate>(() =>
    buildStubGeminiCostEstimate({ beforeMeters, afterMeters }),
  )

  useEffect(() => {
    let active = true
    void requestGeminiCostEstimate({ beforeMeters, afterMeters }).then(
      (next) => {
        if (active) setEstimate(next)
      },
      () => {
        if (active) setEstimate(EMPTY_ESTIMATE)
      },
    )
    return () => {
      active = false
    }
  }, [beforeMeters, afterMeters])

  return (
    <article className="sat-stats" aria-labelledby={titleId}>
      <h2 id={titleId} className="sat-stats__title">
        Before / after
      </h2>
      <div className="sat-stats__body">
        <div className="sat-stats__metrics">
          <p className="sat-stats__distances">
            <span className="sat-stats__sr">Before</span>
            <span>{formatMeters(beforeMeters)}</span>
            <span className="sat-stats__arrow" aria-hidden="true">
              →
            </span>
            <span className="sat-stats__sr">After</span>
            <span>{formatMeters(afterMeters)}</span>
          </p>
          <p className="sat-stats__improvement">
            {formatImprovement(beforeMeters, afterMeters)}
          </p>
        </div>
        <p className="sat-stats__cost">
          <span className="sat-stats__cost-value" aria-live="polite">
            {estimate.display}
          </span>
          <span className="sat-stats__cost-label">{estimate.label}</span>
        </p>
      </div>
    </article>
  )
}
