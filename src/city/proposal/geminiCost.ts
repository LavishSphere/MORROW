import type { Issue } from './issue'

/** Visible label for the cost line on the proposal card. */
export const GEMINI_ESTIMATE_LABEL = 'Gemini estimate'

export type GeminiCostEstimate = {
  label: string
  amountUsd: null
  /** Ready-to-render cost. An em dash means the stub has no quote. */
  display: string
}

/**
 * Local stand-in for a Gemini cost estimate.
 * Does not call Gemini and does not invent a dollar amount.
 * The issue stays on the signature so a later API call can read it.
 */
export function stubGeminiCostEstimate(issue: Issue): GeminiCostEstimate {
  void issue
  return {
    label: 'No Gemini estimate',
    amountUsd: null,
    display: '—',
  }
}
