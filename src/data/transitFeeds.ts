/// <reference types="vite/client" />
import {
  bboxesOverlap,
  TRANSIT_FEEDS,
  type TransitFeedDef,
} from '../../shared/transitFeeds.ts'
import type { LiveFeed, LiveVehicle } from './transitLive.ts'

/**
 * Live rail feeds for agencies other than the MBTA. Each one polls the API
 * proxy (`/api/transit/vehicles?feed=<id>`), which decodes GTFS-realtime,
 * adds keys from server env vars and caches per feed.
 *
 * A feed the server has no key for answers 501. That feed then stops
 * covering any bbox, so the registry stops polling it for the session.
 */

const MIN_POLL_MS = 15_000

// Same base as src/data/api.ts. Optional chaining keeps this importable
// from node tests, where import.meta.env is undefined.
const API_BASE = (
  (import.meta.env?.VITE_API_BASE as string | undefined) ?? ''
).replace(/\/$/, '')

function isLiveVehicle(raw: unknown): raw is LiveVehicle {
  if (!raw || typeof raw !== 'object') return false
  const v = raw as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.lat === 'number' &&
    Number.isFinite(v.lat) &&
    typeof v.lon === 'number' &&
    Number.isFinite(v.lon) &&
    (v.bearing === null || typeof v.bearing === 'number') &&
    typeof v.routeId === 'string' &&
    (v.color === null || typeof v.color === 'string') &&
    (v.status === null || typeof v.status === 'string') &&
    typeof v.updatedAt === 'string'
  )
}

export function createProxyFeed(
  def: TransitFeedDef,
  apiBase = API_BASE,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): LiveFeed {
  let unavailable = false
  const url = `${apiBase}/api/transit/vehicles?feed=${encodeURIComponent(def.id)}`
  return {
    id: def.id,
    label: def.label,
    pollMs: Math.max(MIN_POLL_MS, def.pollMs),
    covers: (bbox) => !unavailable && bboxesOverlap(def.bbox, bbox),
    async fetch(signal) {
      if (unavailable) return []
      const res = await fetchImpl(url, { signal })
      // 501: no key on this server. 404: an API without the transit route.
      if (res.status === 501 || res.status === 404) {
        unavailable = true
        return []
      }
      if (!res.ok) throw new Error(`${def.label} live positions: HTTP ${res.status}`)
      const body = (await res.json()) as unknown
      return Array.isArray(body) ? body.filter(isLiveVehicle) : []
    },
  }
}

export const extraFeeds: LiveFeed[] = TRANSIT_FEEDS.map((def) => createProxyFeed(def))
