import type { IssueKind } from '../../shared/issues.ts'
import { FIXED_COLOR, ISSUE_COLOR, ISSUE_SHAPE } from '../showcase/issueVisuals'

/** The same shape and colour as the issue's pin on the map. */
export function IssueGlyph({ kind, fixed = false }: { kind: IssueKind; fixed?: boolean }) {
  return (
    <span
      className={`issue-glyph issue-glyph--${ISSUE_SHAPE[kind]}`}
      style={{ color: fixed ? FIXED_COLOR : ISSUE_COLOR[kind] }}
      aria-hidden="true"
    />
  )
}
