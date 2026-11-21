import type { EvidenceStatus } from '../types'

const LABELS: Record<EvidenceStatus, string> = {
  verified: 'Verified',
  community_reported: 'Community-reported',
  illustrative: 'Illustrative',
}

type Props = {
  status: EvidenceStatus
}

export function EvidenceBadge({ status }: Props) {
  return (
    <span className={`evidence-badge evidence-badge--${status}`}>
      {LABELS[status]}
    </span>
  )
}
