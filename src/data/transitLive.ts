import { mbtaFeed } from './mbta.ts'
import { extraFeeds } from './transitFeeds.ts'

/**
 * Live transit vehicles, from whichever feed covers the loaded place.
 * A feed is a small object: what it covers, how to fetch it, how often.
 * New agencies join by adding a feed to LIVE_FEEDS; the scene never knows
 * which agency it is drawing. Live vehicles replace simulated trains on
 * the lines they cover.
 */

export type LiveVehicle = {
  id: string
  lat: number
  lon: number
  /** Degrees clockwise from north, when the feed reports one. */
  bearing: number | null
  routeId: string
  /** Line colour as hex ("#da291c"), when known. */
  color: string | null
  status: string | null
  updatedAt: string
}

export type LiveFeed = {
  id: string
  /** Shown in the badge: "Live: MBTA". */
  label: string
  covers(bbox: { west: number; south: number; east: number; north: number }): boolean
  fetch(signal: AbortSignal): Promise<LiveVehicle[]>
  pollMs: number
}

export type GeoBox = { west: number; south: number; east: number; north: number }

/** Every live feed, first match wins. */
export const LIVE_FEEDS: LiveFeed[] = [mbtaFeed, ...extraFeeds]

/** The feed for a loaded place, if any covers it. */
export function feedFor(bbox: GeoBox, feeds: readonly LiveFeed[] = LIVE_FEEDS): LiveFeed | null {
  return feeds.find((feed) => feed.covers(bbox)) ?? null
}

/** The longest wait between polls after repeated failures. */
const MAX_BACKOFF_MS = 5 * 60_000

/**
 * Wait before the next poll: the feed's interval while healthy, doubling
 * after each failure, and at least a minute after a rate limit (HTTP 429).
 */
export function nextPollDelay(pollMs: number, failures: number, rateLimited = false): number {
  const backoff = Math.min(MAX_BACKOFF_MS, pollMs * 2 ** Math.max(0, failures))
  return rateLimited ? Math.max(60_000, backoff) : backoff
}

/** An HTTP failure a feed can throw, so the poller can back off on 429. */
export function feedError(status: number): Error & { status: number } {
  return Object.assign(new Error(`Live feed ${status}`), { status })
}

/** The page, when there is one (tests run without it). */
type Page = {
  visibilityState?: string
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}
const page = () => (globalThis as { document?: Page }).document

type PollHandlers = {
  onVehicles: (vehicles: LiveVehicle[], at: number) => void
  onError?: (error: unknown) => void
  /** Defaults to the page's visibility. */
  isVisible?: () => boolean
  now?: () => number
}

/**
 * Poll a feed while the tab is visible. Pauses when hidden, resumes when
 * shown, backs off on errors. Returns a stop function.
 */
export function startLivePolling(feed: LiveFeed, handlers: PollHandlers): () => void {
  const isVisible = handlers.isVisible ?? (() => page()?.visibilityState !== 'hidden')
  const now = handlers.now ?? (() => Date.now())
  let stopped = false
  let failures = 0
  let rateLimited = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: AbortController | null = null
  let lastFetch = -Infinity

  const schedule = (ms: number) => {
    if (stopped || timer !== undefined) return
    timer = setTimeout(tick, ms)
  }

  async function tick() {
    timer = undefined
    if (stopped || inFlight) return
    // Hidden tab: stop here; becoming visible starts the loop again.
    if (!isVisible()) return
    const controller = new AbortController()
    inFlight = controller
    const timeout = setTimeout(() => controller.abort(), 12_000)
    lastFetch = now()
    try {
      const vehicles = await feed.fetch(controller.signal)
      if (stopped) return
      failures = 0
      rateLimited = false
      handlers.onVehicles(vehicles, now())
    } catch (error) {
      if (stopped) return
      failures += 1
      rateLimited = (error as { status?: unknown })?.status === 429
      handlers.onError?.(error)
    } finally {
      clearTimeout(timeout)
      inFlight = null
    }
    schedule(nextPollDelay(feed.pollMs, failures, rateLimited))
  }

  const onVisibility = () => {
    if (stopped || !isVisible() || timer !== undefined || inFlight) return
    // Back from a hidden tab: poll now, unless the last poll was recent.
    schedule(Math.max(0, lastFetch + nextPollDelay(feed.pollMs, failures, rateLimited) - now()))
  }
  page()?.addEventListener('visibilitychange', onVisibility)
  void tick()

  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    inFlight?.abort()
    page()?.removeEventListener('visibilitychange', onVisibility)
  }
}

/* —— Live status, for the badge outside the canvas —— */

export type LiveStatus = { feedId: string; label: string; updatedAt: number; vehicles: number }

let status: LiveStatus | null = null
const listeners = new Set<() => void>()

export function getLiveStatus() {
  return status
}

export function setLiveStatus(next: LiveStatus | null) {
  if (status === next) return
  status = next
  for (const listener of listeners) listener()
}

export function subscribeLiveStatus(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
