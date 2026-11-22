import { useEffect, useState } from 'react'
import { feedFor, setLiveStatus, startLivePolling, type GeoBox, type LiveFeed, type LiveVehicle } from './transitLive.ts'

type Snapshot = { key: string; vehicles: LiveVehicle[]; at: number }

/**
 * Live vehicles for the loaded place, from the first feed that covers it.
 * Polls only while `enabled` (the place has mapped track) and the tab is
 * visible; stops when the place changes or the city unmounts.
 */
export function useLiveTransit(
  bounds: GeoBox,
  origin: readonly [number, number],
  enabled: boolean,
): { feed: LiveFeed | null; vehicles: LiveVehicle[]; at: number } {
  const feed = enabled ? feedFor(bounds) : null
  // The loaded place's fixed center: more tiles arriving do not restart polling.
  const key = feed ? `${feed.id}@${origin[0].toFixed(3)},${origin[1].toFixed(3)}` : ''
  const [snapshot, setSnapshot] = useState<Snapshot>({ key: '', vehicles: [], at: 0 })

  useEffect(() => {
    if (!feed || !key) return
    const stop = startLivePolling(feed, {
      onVehicles: (vehicles, at) => {
        setSnapshot({ key, vehicles, at })
        setLiveStatus({ feedId: feed.id, label: feed.label, updatedAt: at, vehicles: vehicles.length })
      },
    })
    return () => {
      stop()
      setLiveStatus(null)
    }
  }, [feed, key])

  const current = snapshot.key === key && key !== ''
  return { feed, vehicles: current ? snapshot.vehicles : [], at: current ? snapshot.at : 0 }
}
