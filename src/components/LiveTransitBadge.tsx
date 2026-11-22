import { useSyncExternalStore } from 'react'
import { getLiveStatus, subscribeLiveStatus } from '../data/transitLive'

/** "Live: MBTA · updated 14:05" while a live transit feed is drawing trains. */
export function LiveTransitBadge() {
  const status = useSyncExternalStore(subscribeLiveStatus, getLiveStatus, getLiveStatus)
  if (!status) return null
  const time = new Date(status.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <p className="minimap__live" role="status" title={`${status.vehicles} vehicles from ${status.label}`}>
      <span className="minimap__live-dot" aria-hidden="true" />
      Live: {status.label} · updated {time}
    </p>
  )
}
