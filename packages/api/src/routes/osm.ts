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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
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
const USER_AGENT = "MORROW/1.0 (accessibility proposals; +https://morrow.khayrul.com)";

/** Map data changes slowly; a week-old street map is fine for a demo. */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_QUERY = 12_000;
/** At most this many Overpass downloads at once, to stay a polite client. */
const UPSTREAM_SLOTS = 2;

/** Pterodactyl keeps /home/container between restarts; elsewhere use the temp dir. */
export function cacheDir(): string {
  const set = process.env.MORROW_CACHE_DIR?.trim();
  if (set) return set;
  return existsSync("/home/container") ? "/home/container/osm-cache" : join(tmpdir(), "morrow-osm-cache");
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
const waiting: (() => void)[] = [];
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (busy >= UPSTREAM_SLOTS) await new Promise<void>((resolve) => waiting.push(resolve));
  busy += 1;
  try {
    return await work();
  } finally {
    busy -= 1;
    waiting.shift()?.();
  }
}

/** Ask each public server in turn; the body is checked to be JSON before it is kept. */
async function askOverpass(query: string): Promise<Buffer> {
  let last = "no server answered";
  for (const url of UPSTREAMS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(85_000),
      });
      if (!res.ok) {
        last = `${new URL(url).host} answered ${res.status}`;
        // A bad query fails the same way everywhere.
        if (res.status === 400) break;
        continue;
      }
      const text = await res.text();
      const body = JSON.parse(text) as { remark?: unknown; elements?: unknown };
      if (!Array.isArray(body.elements)) {
        last = `${new URL(url).host} sent no elements`;
        continue;
      }
      // A query cut short by the server's own time limit is not worth keeping.
      if (typeof body.remark === "string" && /runtime error|timed out|out of memory/i.test(body.remark)) {
        last = `${new URL(url).host}: ${body.remark.slice(0, 120)}`;
        continue;
      }
      return gzipSync(text);
    } catch (err) {
      last = `${new URL(url).host}: ${err instanceof Error ? err.message : "failed"}`;
    }
  }
  throw new Error(last);
}

/** One download per query, however many visitors ask for it at once. */
const inflight = new Map<string, Promise<Buffer>>();

/** The gzipped JSON answer for a query, from disk or from Overpass. */
export async function osmAnswer(query: string): Promise<{ gz: Buffer; hit: boolean }> {
  const key = keyFor(query);
  const cached = await readCached(key);
  if (cached) return { gz: cached, hit: true };
  let pending = inflight.get(key);
  if (!pending) {
    pending = slot(() => askOverpass(query))
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
  try {
    const { gz, hit } = await osmAnswer(query);
    const gzipOk = /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=86400",
      "x-morrow-cache": hit ? "hit" : "miss",
      ...(gzipOk ? { "content-encoding": "gzip", vary: "accept-encoding" } : {}),
    });
    res.end(gzipOk ? gz : (await import("node:zlib")).gunzipSync(gz));
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
export async function warmMajorCities(log: (line: string) => void): Promise<void> {
  if (process.env.MORROW_PREWARM?.trim() === "0") {
    log("OSM pre-load: off (MORROW_PREWARM=0)");
    return;
  }
  const places: [string, number, number][] = [];
  for (const name of MAJOR_CITIES) {
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
          const { hit } = await osmAnswer(query);
          if (!hit) fetched += 1;
        } catch (err) {
          failed += 1;
          log(`OSM pre-load: ${name} failed (${err instanceof Error ? err.message : "error"})`);
        }
      }
    }
    log(`OSM pre-load: ${label} done (${fetched} downloaded, ${failed} failed, the rest already cached)`);
  }
}
