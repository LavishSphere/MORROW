/** Modeled trip length for the before/after card. */
export function formatMeters(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return 'Unreachable'
  return `${Math.round(meters).toLocaleString('en-US')} m`
}

/**
 * Improvement between two modeled distances.
 * Positive savings are "shorter"; a longer trip is reported as longer.
 */
export function formatImprovement(
  beforeMeters: number | null,
  afterMeters: number | null,
): string {
  const beforeMissing = beforeMeters == null || !Number.isFinite(beforeMeters)
  const afterMissing = afterMeters == null || !Number.isFinite(afterMeters)
  if (beforeMissing && !afterMissing) return 'Became reachable'
  if (!beforeMissing && afterMissing) return 'No longer reachable'
  if (beforeMissing || afterMissing) return 'No modeled change'
  const delta = Math.round(afterMeters) - Math.round(beforeMeters)
  if (delta === 0) return 'Same distance'
  const amount = formatMeters(Math.abs(delta))
  return delta < 0 ? `${amount} shorter` : `${amount} longer`
}

/** USD display for a Gemini cost estimate. Null means the stub has no quote. */
export function formatCostUsd(amountUsd: number | null): string {
  if (amountUsd == null || !Number.isFinite(amountUsd)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amountUsd)
}
