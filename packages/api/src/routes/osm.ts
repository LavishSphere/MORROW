/**
 * OpenStreetMap through the API: browsers send the Overpass query text, and
 * the API answers from its disk cache or asks the public Overpass servers
 * once, then keeps the answer. Many visitors loading Boston cost one
 * download, and a busy or blocked public server stops being every visitor's
 * problem. Major cities are pre-loaded at startup (see warmMajorCities).
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, rename } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  firstViewQueries,
  MAJOR_CITIES,
  ringTiles,
  tileQuery,
} from "../../../../shared/osmQueries.ts";
import { readJsonBody, sendJson } from "../http.ts";

const UPSTREAMS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

/** Overpass asks API clients to say who they are. */
const USER_AGENT = "MORROW/1.0 (accessibility proposals; +https://plsfixthisshit.work)";

/** Map data changes slowly; a week-old street map is fine for a demo. */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_QUERY = 12_000;
/** At most this many Overpass downloads at once, to stay a polite client. */
const UPSTREAM_SLOTS = 2;

/** Pterodactyl keeps /home/container between restarts; elsewhere a folder beside the working directory. */
export function cacheDir(): string {
  const set = process.env.MORROW_CACHE_DIR?.trim();
  if (set) return set;
  return existsSync("/home/container") ? "/home/container/osm-cache" : join(process.cwd(), ".osm-cache");
}

function keyFor(query: string) {
  return createHash("sha256").update(query).digest("hex");
}

/** Only the kinds of query the city loader sends: JSON output, no huge text. */
export function acceptableQuery(query: unknown): query is string {
  return typeof query === "string" && query.length <= MAX_QUERY && query.startsWith("[out:json]");
}

async function readCached(key: string): Promise<Buffer | null> {
  const file = join(cacheDir(), `${key}.json.gz`);
  // One open handle for both the age check and the read, so they see the same file.
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return null;
  try {
    const info = await handle.stat();
    if (Date.now() - info.mtimeMs > FRESH_MS) return null;
    return await handle.readFile();
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

async function writeCached(key: string, gz: Buffer) {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // An unguessable name, created fresh (never an existing file), readable only by us.
  const tmp = join(dir, `${key}.${randomBytes(8).toString("hex")}.tmp`);
  const handle = await open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(gz);
  } finally {
    await handle.close();
  }
  await rename(tmp, join(dir, `${key}.json.gz`));
}

let busy = 0;
let busyBackground = 0;
const waitingLive: (() => void)[] = [];
const waitingBackground: (() => void)[] = [];

/**
 * Visitors first: a visitor's download takes any free slot and jumps the
 * queue. Pre-loading uses at most one slot, and only while no visitor waits,
 * so it never slows down someone loading a city.
 */
function canStart(background: boolean) {
  if (busy >= UPSTREAM_SLOTS) return false;
  return !background || (busyBackground < 1 && waitingLive.length === 0);
}

function wakeNext() {
  if (waitingLive.length && canStart(false)) waitingLive.shift()?.();
  else if (waitingBackground.length && canStart(true)) waitingBackground.shift()?.();
}

async function slot<T>(work: () => Promise<T>, background: boolean): Promise<T> {
  while (!canStart(background)) {
    await new Promise<void>((resolve) => (background ? waitingBackground : waitingLive).push(resolve));
  }
  busy += 1;
  if (background) busyBackground += 1;
  try {
    return await work();
  } finally {
    busy -= 1;
    if (background) busyBackground -= 1;
    wakeNext();
  }
}

/** Wait for a response to start; a server that stays silent this long is skipped. */
async function startsWithin(work: Promise<Response>, ms: number): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Servers that recently refused this server or stayed silent are skipped for
 * a while, so a visitor's request for an uncached place fails in a moment
 * (and their browser asks Overpass itself) instead of waiting out timeouts.
 */
const benchedUntil = new Map<string, number>();
const BENCH_MS = 10 * 60 * 1000;
const bench = (url: string) => benchedUntil.set(url, Date.now() + BENCH_MS);
const benched = (url: string) => (benchedUntil.get(url) ?? 0) > Date.now();

/** Thrown when every server is benched: nothing worth waiting for. */
export class OverpassUnavailable extends Error {}

/**
 * Ask Overpass. The main server (overpass-api.de) is the one that reliably
 * answers, often after queueing, so it gets three tries with a pause when it
 * says it is busy; the backups are asked last and skipped quickly if silent.
 * A server that refuses (401/403/406) or stays silent is benched for ten
 * minutes. The body is checked to be complete JSON before it is kept.
 */
async function askOverpass(query: string): Promise<Buffer> {
  const tried: string[] = [];
  const [main, ...backups] = UPSTREAMS;
  const plan: { url: string; startMs: number }[] = [
    { url: main, startMs: 110_000 },
    { url: main, startMs: 110_000 },
    { url: main, startMs: 110_000 },
    ...backups.map((url) => ({ url, startMs: 25_000 })),
  ];
  for (const [i, { url, startMs }] of plan.entries()) {
    if (benched(url)) continue;
    const host = new URL(url).host;
    try {
      const res = await startsWithin(
        fetch(url, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": USER_AGENT,
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(150_000),
        }),
        startMs,
      );
      if (!res.ok) {
        tried.push(`${host} ${res.status}`);
        // A bad query fails the same way everywhere.
        if (res.status === 400) break;
        // Refused outright: this server will not serve us for a while.
        if (res.status === 401 || res.status === 403 || res.status === 406) {
          bench(url);
          continue;
        }
        // Busy: Overpass frees a slot within seconds.
        if (url === main && (res.status === 429 || res.status === 504) && i < 2) await pause(8_000 * (i + 1));
        continue;
      }
      const text = await res.text();
      const body = JSON.parse(text) as { remark?: unknown; elements?: unknown };
      if (!Array.isArray(body.elements)) {
        tried.push(`${host} sent no elements`);
        continue;
      }
      // A query cut short by the server's own time limit is not worth keeping.
      if (typeof body.remark === "string" && /runtime error|timed out|out of memory/i.test(body.remark)) {
        tried.push(`${host}: ${body.remark.slice(0, 120)}`);
        continue;
      }
      return gzipSync(text);
    } catch (err) {
      tried.push(`${host}: ${err instanceof Error ? err.message : "failed"}`);
      // Silent backups are benched; the main server gets its next try.
      if (url !== main) bench(url);
    }
  }
  if (!tried.length) throw new OverpassUnavailable("every Overpass server is refusing or silent right now");
  throw new Error(tried.join("; "));
}

/** One download per query, however many visitors ask for it at once. */
const inflight = new Map<string, Promise<Buffer>>();

/** The gzipped JSON answer for a query, from disk or from Overpass. */
export async function osmAnswer(query: string, background = false): Promise<{ gz: Buffer; hit: boolean }> {
  const key = keyFor(query);
  const cached = await readCached(key);
  if (cached) return { gz: cached, hit: true };
  let pending = inflight.get(key);
  if (!pending) {
    pending = slot(() => askOverpass(query), background)
      .then(async (gz) => {
        await writeCached(key, gz).catch((err: unknown) =>
          console.error("[@morrow/api] OSM cache write failed:", err instanceof Error ? err.message : err),
        );
        return gz;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return { gz: await pending, hit: false };
}

function sendGz(req: IncomingMessage, res: ServerResponse, gz: Buffer, hit: boolean) {
  const gzipOk = /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=86400",
    "x-morrow-cache": hit ? "hit" : "miss",
    ...(gzipOk ? { "content-encoding": "gzip", vary: "accept-encoding" } : {}),
  });
  res.end(gzipOk ? gz : gunzipSync(gz));
}

export async function handleOsm(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_QUERY + 1_000);
  } catch {
    sendJson(res, 400, { error: "Expected JSON { query }." });
    return;
  }
  const query = (body as { query?: unknown } | null)?.query;
  if (!acceptableQuery(query)) {
    sendJson(res, 400, { error: "Expected an Overpass [out:json] query." });
    return;
  }
  // Cache only: answer from disk, or say "not cached" at once and download
  // it in the background so the next visitor gets it instantly.
  if ((body as { cacheOnly?: unknown }).cacheOnly === true) {
    const cached = await readCached(keyFor(query));
    if (!cached) {
      void osmAnswer(query, true).catch(() => undefined);
      sendJson(res, 404, { error: "Not cached yet; downloading in the background." });
      return;
    }
    sendGz(req, res, cached, true);
    return;
  }
  try {
    const { gz, hit } = await osmAnswer(query);
    sendGz(req, res, gz, hit);
  } catch (err) {
    sendJson(res, 502, { error: `OpenStreetMap is unavailable: ${err instanceof Error ? err.message : "failed"}` });
  }
}

const GEOCODE = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

/** The same lookup the address bar makes, so pre-loaded tiles are the ones it asks for. */
async function geocode(name: string): Promise<[number, number] | null> {
  const url = new URL(GEOCODE);
  url.searchParams.set("f", "json");
  url.searchParams.set("singleLine", name);
  url.searchParams.set("sourceCountry", "USA");
  url.searchParams.set("maxLocations", "1");
  url.searchParams.set("outFields", "City,RegionAbbr,Addr_type");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { candidates?: { location?: { x?: number; y?: number } }[] };
    const at = body.candidates?.[0]?.location;
    return typeof at?.x === "number" && typeof at.y === "number" ? [at.x, at.y] : null;
  } catch {
    return null;
  }
}

/**
 * Pre-load the first view of every major city, then the ring of tiles
 * around each. Runs in the background, one download at a time, and skips
 * whatever is already cached. MORROW_PREWARM=0 turns it off.
 */
export async function warmMajorCities(
  log: (line: string) => void,
  cities: readonly string[] = MAJOR_CITIES,
): Promise<void> {
  if (process.env.MORROW_PREWARM?.trim() === "0") {
    log("OSM pre-load: off (MORROW_PREWARM=0)");
    return;
  }
  const places: [string, number, number][] = [];
  for (const name of cities) {
    const at = await geocode(name);
    if (at) places.push([name, at[0], at[1]]);
  }
  log(`OSM pre-load: ${places.length} cities, cache in ${cacheDir()}`);
  const passes: [string, (lng: number, lat: number) => string[]][] = [
    ["first views", (lng, lat) => firstViewQueries(lng, lat)],
    ["nearby tiles", (lng, lat) => ringTiles(lng, lat, 1).map(tileQuery)],
  ];
  for (const [label, queries] of passes) {
    let fetched = 0;
    let failed = 0;
    for (const [name, lng, lat] of places) {
      for (const query of queries(lng, lat)) {
        try {
          const { hit } = await osmAnswer(query, true);
          if (!hit) fetched += 1;
        } catch (err) {
          failed += 1;
          log(`OSM pre-load: ${name} failed (${err instanceof Error ? err.message : "error"})`);
          // Nothing will answer for a while: wait instead of failing every city.
          if (err instanceof OverpassUnavailable) await pause(BENCH_MS);
        }
      }
    }
    log(`OSM pre-load: ${label} done (${fetched} downloaded, ${failed} failed, the rest already cached)`);
  }
}
