/** Id of the problem that follows `selectedId`, wrapping after the last. */
export function nextProblemId(
  problems: readonly { id: string }[],
  selectedId: string | null | undefined,
): string | null {
  if (problems.length === 0) return null;
  const index = problems.findIndex((problem) => problem.id === selectedId);
  const next = problems[(index + 1) % problems.length];
  return next?.id ?? null;
}
