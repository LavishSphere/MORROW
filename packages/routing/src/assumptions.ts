/**
 * Default honesty copy for modeled routing results.
 * Always ship with before/after metrics — never imply surveyed engineering truth.
 */
export const DEFAULT_MODEL_ASSUMPTIONS: readonly string[] = [
  "Results are modeled impact from a demonstration walkable graph, not surveyed field measurements.",
  "This graph is a demo / synthetic network unless explicitly replaced with attributed starter-data GeoJSON.",
  "No site inspection or engineering feasibility assessment was performed.",
  "Wheelchair accessibility flags are scenario constraints on edges, not verified ADA compliance claims.",
  "Do not treat before/after meters as proof that real infrastructure improved.",
] as const;

export function mergeAssumptions(
  extra: readonly string[] | undefined = undefined,
): readonly string[] {
  if (!extra || extra.length === 0) {
    return DEFAULT_MODEL_ASSUMPTIONS;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...DEFAULT_MODEL_ASSUMPTIONS, ...extra]) {
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out;
}
