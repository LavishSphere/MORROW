import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { findTransitFeed } from "../shared/transitFeeds.ts";
import { createProxyFeed, extraFeeds } from "../src/data/transitFeeds.ts";

const PHILLY = { west: -75.25, south: 39.9, east: -75.1, north: 40.0 };
const DENVER = { west: -105.05, south: 39.7, east: -104.95, north: 39.78 };

function respond(status: number, body: unknown) {
  const urls: string[] = [];
  const impl = (async (input: URL | string | Request) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, urls };
}

test("extra feeds cover only their own city and poll no faster than 15 s", () => {
  const septa = extraFeeds.find((f) => f.id === "septa");
  assert.ok(septa);
  assert.equal(septa.covers(PHILLY), true);
  assert.equal(septa.covers(DENVER), false);
  for (const feed of extraFeeds) assert.ok(feed.pollMs >= 15_000, feed.id);
  assert.equal(extraFeeds.some((f) => f.id === "mbta"), false, "MBTA lives in the rail layer");
});

test("a proxy feed calls the API and keeps only well-formed vehicles", async () => {
  const def = findTransitFeed("rtd");
  assert.ok(def);
  const good = {
    id: "rtd:1",
    lat: 39.75,
    lon: -105,
    bearing: null,
    routeId: "A",
    color: "#57C1E9",
    status: "IN_TRANSIT_TO",
    updatedAt: "2026-11-22T05:00:00.000Z",
  };
  const { impl, urls } = respond(200, [good, { id: "bad", lat: "39" }]);
  const feed = createProxyFeed(def, "https://api.example.org", impl);
  const vehicles = await feed.fetch(new AbortController().signal);
  assert.deepEqual(vehicles, [good]);
  assert.deepEqual(urls, ["https://api.example.org/api/transit/vehicles?feed=rtd"]);
});

test("a feed the server has no key for stops covering and stops fetching", async () => {
  const def = findTransitFeed("wmata");
  assert.ok(def);
  const { impl, urls } = respond(501, { error: "Feed wmata needs WMATA_API_KEY" });
  const feed = createProxyFeed(def, "", impl);
  const dc = { west: -77.05, south: 38.88, east: -77.0, north: 38.92 };
  assert.equal(feed.covers(dc), true);
  assert.deepEqual(await feed.fetch(new AbortController().signal), []);
  assert.equal(feed.covers(dc), false);
  await feed.fetch(new AbortController().signal);
  assert.equal(urls.length, 1);
});

test("other upstream errors throw so the registry can retry", async () => {
  const def = findTransitFeed("septa");
  assert.ok(def);
  const feed = createProxyFeed(def, "", respond(502, { error: "down" }).impl);
  await assert.rejects(feed.fetch(new AbortController().signal), /HTTP 502/);
  assert.equal(feed.covers(PHILLY), true);
});

test("transitLive keeps the shared LiveVehicle and LiveFeed contract", async () => {
  const text = await readFile("src/data/transitLive.ts", "utf8");
  assert.match(text, /export type LiveVehicle = \{\s*id: string\s*lat: number\s*lon: number/);
  assert.match(text, /fetch\(signal: AbortSignal\): Promise<LiveVehicle\[\]>\s*pollMs: number\s*\}/);
  // The extra agencies join the MBTA feed in one registry.
  assert.match(text, /export const LIVE_FEEDS: LiveFeed\[\] = \[mbtaFeed, \.\.\.extraFeeds\]/);
});
