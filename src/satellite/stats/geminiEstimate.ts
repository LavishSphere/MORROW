import { formatCostUsd } from './format'

/** Visible label under the cost on the before/after card. */
export const GEMINI_ESTIMATE_LABEL = 'Gemini estimate'

export type GeminiCostEstimateInput = {
  beforeMeters: number | null
  afterMeters: number | null
}

export type GeminiCostEstimate = {
  label: string
  amountUsd: number | null
  /** Ready-to-render cost. */
  display: string
}

/**
 * Replacement the app can assign when a Gemini API call exists.
 * Implementations must live outside this folder; this module never calls Gemini.
 */
export type GeminiCostEstimateFn = (
  input: GeminiCostEstimateInput,
) => Promise<GeminiCostEstimate>

/**
 * Local stand-in until a Gemini API call exists.
 * Does not call Gemini and does not invent a dollar amount.
 */
export function buildStubGeminiCostEstimate(
  input: GeminiCostEstimateInput,
): GeminiCostEstimate {
  void input
  return {
    label: 'No Gemini estimate',
    amountUsd: null,
    display: formatCostUsd(null),
  }
}

/**
 * Stub the app can later point at a Gemini API call.
 * Does not call Gemini.
 */
export function stubGeminiCostEstimate(
  input: GeminiCostEstimateInput,
): Promise<GeminiCostEstimate> {
  return Promise.resolve(buildStubGeminiCostEstimate(input))
}

let pointedEstimate: GeminiCostEstimateFn = stubGeminiCostEstimate

/** Point the before/after card at a Gemini API call. */
export function setGeminiCostEstimate(next: GeminiCostEstimateFn): void {
  pointedEstimate = next
}

/** Restore the local stub. */
export function resetGeminiCostEstimate(): void {
  pointedEstimate = stubGeminiCostEstimate
}

/** Runs the stub until `setGeminiCostEstimate` points it elsewhere. */
export function requestGeminiCostEstimate(
  input: GeminiCostEstimateInput,
): Promise<GeminiCostEstimate> {
  return pointedEstimate(input)
}
