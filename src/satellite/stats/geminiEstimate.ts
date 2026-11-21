import { formatCostUsd } from './format'

/** Visible label under the cost on the before/after card. */
export const GEMINI_ESTIMATE_LABEL = 'Gemini estimate'

/**
 * Stand-in amount until the app points this module at a Gemini API call.
 * This is not a live model response and not an engineering quote.
 */
const STUB_COST_USD = 4800

export type GeminiCostEstimateInput = {
  beforeMeters: number | null
  afterMeters: number | null
}

export type GeminiCostEstimate = {
  label: typeof GEMINI_ESTIMATE_LABEL
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
 * Local stand-in for a Gemini cost estimate.
 * Does not call Gemini. Distances stay on the signature so a later API call can read them.
 */
export function buildStubGeminiCostEstimate(
  input: GeminiCostEstimateInput,
): GeminiCostEstimate {
  void input
  return {
    label: GEMINI_ESTIMATE_LABEL,
    amountUsd: STUB_COST_USD,
    display: formatCostUsd(STUB_COST_USD),
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
