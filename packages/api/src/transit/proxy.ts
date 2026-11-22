/**
 * Fetch, decode and cache live rail vehicle positions per feed.
 *
 * Only feeds listed in shared/transitFeeds.ts can be requested, so this is
 * not an open proxy. Each feed is cached for `cacheMs` (10 s by default) and
 * concurrent requests share one upstream fetch. When an upstream fails, the
 * last good answer is served for up to two minutes before the error shows.
 */

import {
  findTransitFeed,
  routeColor,
  type TransitFeedDef,
} from "../../../../shared/transitFeeds.ts";
import { decodeVehiclePositions } from "./gtfsRealtime.ts";

/** Same shape as LiveVehicle in src/data/transitLive.ts. */
export type TransitVehicle = {
  id: string;
  lat: number;
  lon: number;
  bearing: number | null;
  routeId: string;
  color: string | null;
  status: string | null;
  updatedAt: string;
};

export class TransitFeedError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type TransitProxyOptions = {
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
  timeoutMs?: number;
};

const DEFAULT_CACHE_MS = 10_000;
const STALE_OK_MS = 120_000;
/** Positions older than this are parked or out of service. */
const MAX_POSITION_AGE_S = 600;
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;

type CacheEntry = { at: number; vehicles: TransitVehicle[] };

function isoFromSeconds(seconds: number | null, fallbackMs: number): string {
  const ms = seconds && seconds > 0 ? seconds * 1000 : fallbackMs;
  return new Date(ms).toISOString();
}

function validLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

/** Float32 coordinates carry ~1 m of noise; 5 decimals is ~1 m. */
function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Decode one GTFS-realtime document into vehicles for this feed. */
export function vehiclesFromGtfsRt(
  feed: TransitFeedDef,
  body: Uint8Array,
  nowMs: number,
): TransitVehicle[] {
  const decoded = decodeVehiclePositions(body);
  const out: TransitVehicle[] = [];
  for (const v of decoded.vehicles) {
    const { lat, lon } = v;
    if (lat === null || lon === null || !validLatLon(lat, lon)) continue;
    const routeId = v.routeId ?? "";
    const color = routeId ? routeColor(feed, routeId) : null;
    if (feed.railOnly && !color) continue;
    if (v.timestamp && nowMs / 1000 - v.timestamp > MAX_POSITION_AGE_S) continue;
    out.push({
      id: `${feed.id}:${v.vehicleId ?? v.entityId}`,
      lat: round(lat, 5),
      lon: round(lon, 5),
      bearing: v.bearing !== null && Number.isFinite(v.bearing) ? round(v.bearing, 1) : null,
      routeId,
      color,
      status: v.currentStatus,
      updatedAt: isoFromSeconds(v.timestamp, nowMs),
    });
  }
  return out;
}

type CtaTrain = {
  rn?: unknown;
  lat?: unknown;
  lon?: unknown;
  heading?: unknown;
  isApp?: unknown;
  isDly?: unknown;
};

/** CTA Train Tracker `ttpositions.aspx?outputType=JSON`. */
export function vehiclesFromCtaTrainTracker(
  feed: TransitFeedDef,
  body: unknown,
  nowMs: number,
): TransitVehicle[] {
  const ctatt = (body as { ctatt?: { errCd?: unknown; errNm?: unknown; route?: unknown } })
    ?.ctatt;
  if (!ctatt) throw new TransitFeedError(502, "CTA response had no ctatt object");
  if (ctatt.errCd !== undefined && String(ctatt.errCd) !== "0") {
    throw new TransitFeedError(502, `CTA error ${String(ctatt.errCd)}: ${String(ctatt.errNm ?? "")}`);
  }
  const routes = Array.isArray(ctatt.route) ? ctatt.route : ctatt.route ? [ctatt.route] : [];
  const updatedAt = new Date(nowMs).toISOString();
  const out: TransitVehicle[] = [];
  for (const route of routes as Array<{ "@name"?: unknown; train?: unknown }>) {
    const code = String(route["@name"] ?? "");
    const color = routeColor(feed, code);
    const routeId = color
      ? (Object.keys(feed.routes).find((id) => id.toLowerCase() === code.toLowerCase()) ?? code)
      : code;
    const trains = Array.isArray(route.train) ? route.train : route.train ? [route.train] : [];
    for (const t of trains as CtaTrain[]) {
      const lat = Number(t.lat);
      const lon = Number(t.lon);
      if (!validLatLon(lat, lon)) continue;
      const heading = Number(t.heading);
      out.push({
        id: `${feed.id}:${String(t.rn ?? `${code}-${out.length}`)}`,
        lat,
        lon,
        bearing: Number.isFinite(heading) ? heading : null,
        routeId,
        color,
        status: String(t.isApp) === "1" ? "INCOMING_AT" : "IN_TRANSIT_TO",
        updatedAt,
      });
    }
  }
  return out;
}

export function createTransitProxy(options: TransitProxyOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<TransitVehicle[]>>();

  function keyFor(feed: TransitFeedDef): string | null {
    if (!feed.key) return null;
    const value = env[feed.key.env]?.trim();
    if (!value) {
      throw new TransitFeedError(501, `Feed ${feed.id} needs ${feed.key.env} on the API server`);
    }
    return value;
  }

  async function fetchSource(
    feed: TransitFeedDef,
    source: TransitFeedDef["sources"][number],
    key: string | null,
  ): Promise<TransitVehicle[]> {
    const url = new URL(source.url);
    const headers: Record<string, string> = {
      accept: source.format === "gtfs-rt" ? "application/x-protobuf, */*" : "application/json",
      "user-agent": "morrow-api (transit vehicles)",
    };
    if (key && feed.key?.query) url.searchParams.set(feed.key.query, key);
    if (key && feed.key?.header) headers[feed.key.header] = key;

    let res: Response;
    try {
      res = await doFetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
      throw new TransitFeedError(504, `${feed.label} upstream ${reason}`);
    }
    if (!res.ok) {
      throw new TransitFeedError(502, `${feed.label} upstream answered ${res.status}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_UPSTREAM_BYTES) {
      throw new TransitFeedError(502, `${feed.label} upstream response too large`);
    }
    try {
      if (source.format === "gtfs-rt") return vehiclesFromGtfsRt(feed, bytes, now());
      // TextDecoder drops a leading byte-order mark by default.
      const text = new TextDecoder().decode(bytes);
      return vehiclesFromCtaTrainTracker(feed, JSON.parse(text) as unknown, now());
    } catch (err) {
      if (err instanceof TransitFeedError) throw err;
      throw new TransitFeedError(502, `${feed.label} upstream sent an unreadable feed`);
    }
  }

  async function load(feed: TransitFeedDef): Promise<TransitVehicle[]> {
    const key = keyFor(feed);
    const settled = await Promise.allSettled(feed.sources.map((s) => fetchSource(feed, s, key)));
    const parts = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    // One source down (SEPTA rail vs trolleys) still shows the other.
    if (parts.length === 0) {
      const first = settled.find((r) => r.status === "rejected");
      throw first?.reason ?? new TransitFeedError(502, `${feed.label} has no sources`);
    }
    const seen = new Set<string>();
    const merged: TransitVehicle[] = [];
    for (const v of parts.flat()) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      merged.push(v);
    }
    return merged;
  }

  async function vehicles(feedId: string): Promise<TransitVehicle[]> {
    const feed = findTransitFeed(feedId);
    if (!feed) throw new TransitFeedError(404, `Unknown transit feed: ${feedId}`);
    const cached = cache.get(feed.id);
    const ttl = feed.cacheMs ?? DEFAULT_CACHE_MS;
    if (cached && now() - cached.at < ttl) return cached.vehicles;

    let pending = inflight.get(feed.id);
    if (!pending) {
      pending = load(feed).finally(() => inflight.delete(feed.id));
      inflight.set(feed.id, pending);
    }
    try {
      const fresh = await pending;
      cache.set(feed.id, { at: now(), vehicles: fresh });
      return fresh;
    } catch (err) {
      const isConfigError = err instanceof TransitFeedError && err.status === 501;
      if (!isConfigError && cached && now() - cached.at < STALE_OK_MS) return cached.vehicles;
      throw err;
    }
  }

  return { vehicles, clear: () => cache.clear() };
}

export type TransitProxy = ReturnType<typeof createTransitProxy>;
