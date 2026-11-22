import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { inBostonArea, mbtaFeed, MBTA_VEHICLES_URL, parseMbtaVehicles } from "../src/data/mbta.ts";
import type { Pt } from "../src/data/rail.ts";
import { alongAt, consistPoses, placeLiveVehicles, retarget, type TrackLine } from "../src/data/trains.ts";
import { feedFor, LIVE_FEEDS, nextPollDelay, startLivePolling, type LiveFeed, type LiveVehicle } from "../src/data/transitLive.ts";

const fixture = async () => JSON.parse(await readFile("test/fixtures/mbta-vehicles.json", "utf8")) as unknown;

test("MBTA vehicles parse with their route colour", async () => {
  const vehicles = parseMbtaVehicles(await fixture());
  assert.equal(vehicles.length, 4);
  const red = vehicles.find((v) => v.routeId === "Red")!;
  assert.equal(red.color, "#da291c");
  assert.equal(red.lat, 42.2932);
  assert.equal(red.bearing, 160);
  assert.equal(red.status, "STOPPED_AT");
  assert.match(red.updatedAt, /^2026-/);
  assert.equal(vehicles.find((v) => v.routeId === "CR-Worcester")?.color, "#80276c");
  assert.equal(vehicles.find((v) => v.routeId === "Green-B")?.color, "#00843d");
  assert.deepEqual(parseMbtaVehicles({}), []);
  assert.deepEqual(parseMbtaVehicles({ data: [{ id: "x", attributes: { latitude: "no" } }] }), []);
  // Trains only: subway, light rail, Commuter Rail. Trimmed fields.
  assert.match(MBTA_VEHICLES_URL, /filter\[route_type\]=0,1,2/);
  assert.match(MBTA_VEHICLES_URL, /include=route/);
  assert.match(MBTA_VEHICLES_URL, /fields\[vehicle\]=/);
});

test("the MBTA feed runs only for places in the Boston area", () => {
  assert.equal(inBostonArea(-71.0589, 42.3601), true);
  assert.equal(inBostonArea(-71.8023, 42.2626), true); // Worcester
  assert.equal(inBostonArea(-122.4194, 37.7749), false);
  assert.equal(inBostonArea(-73.9857, 40.7484), false);
  const box = (lon: number, lat: number) => ({ west: lon - 0.01, east: lon + 0.01, south: lat - 0.01, north: lat + 0.01 });
  assert.equal(mbtaFeed.covers(box(-71.06, 42.36)), true);
  assert.equal(mbtaFeed.covers(box(-122.27, 37.8)), false);
  assert.equal(feedFor(box(-71.06, 42.36))?.id, "mbta");
  assert.equal(feedFor(box(-87.63, 41.88)), null);
  assert.ok(LIVE_FEEDS.includes(mbtaFeed));
  assert.equal(mbtaFeed.pollMs, 15_000);
});

test("polling backs off after errors and waits at least a minute after a rate limit", () => {
  assert.equal(nextPollDelay(15_000, 0), 15_000);
  assert.equal(nextPollDelay(15_000, 1), 30_000);
  assert.equal(nextPollDelay(15_000, 2), 60_000);
  assert.equal(nextPollDelay(15_000, 10), 300_000);
  assert.equal(nextPollDelay(15_000, 1, true), 60_000);
});

test("the poller fetches while visible, skips hidden tabs, and reports errors", async () => {
  const vehicle: LiveVehicle = { id: "1", lat: 42.35, lon: -71.06, bearing: 0, routeId: "Red", color: "#da291c", status: null, updatedAt: "" };
  let calls = 0;
  const feed: LiveFeed = { id: "t", label: "Test", pollMs: 15_000, covers: () => true, fetch: async () => (calls++, [vehicle]) };
  const got: LiveVehicle[][] = [];
  const stop = startLivePolling(feed, { onVehicles: (v) => got.push(v), isVisible: () => true });
  await new Promise((r) => setImmediate(r));
  stop();
  assert.equal(calls, 1);
  assert.deepEqual(got, [[vehicle]]);

  const hidden = startLivePolling(feed, { onVehicles: () => {}, isVisible: () => false });
  await new Promise((r) => setImmediate(r));
  hidden();
  assert.equal(calls, 1);

  const errors: unknown[] = [];
  const limited: LiveFeed = { ...feed, fetch: async () => Promise.reject(Object.assign(new Error("429"), { status: 429 })) };
  const stopLimited = startLivePolling(limited, { onVehicles: () => {}, onError: (e) => errors.push(e), isVisible: () => true });
  await new Promise((r) => setImmediate(r));
  stopLimited();
  assert.equal((errors[0] as { status: number }).status, 429);
});

test("live vehicles snap to track of their colour, face their bearing, and glide between polls", () => {
  // North is −z: a north–south red line and a parallel orange one.
  const lines: TrackLine[] = [
    { points: [[0, 0], [0, -100]] as Pt[], colour: "#da291c", railway: "subway", underground: true, bridge: false },
    { points: [[3, 0], [3, -100]] as Pt[], colour: "#ed8b00", railway: "subway", underground: false, bridge: false },
  ];
  const project = (lon: number, lat: number) => [lon, -lat] as const;
  const at = (lat: number, bearing: number | null, color: string | null): LiveVehicle => ({
    id: `v${lat}`, lat, lon: 2, bearing, routeId: "x", color, status: null, updatedAt: "",
  });
  const placed = placeLiveVehicles([at(40, 0, "#DA291C"), at(60, 180, "#ed8b00"), at(50, 0, "#003da5")], lines, project);
  assert.equal(placed.length, 2);
  assert.deepEqual([placed[0]?.line, placed[0]?.along, placed[0]?.dir], [0, 40, 1]);
  assert.deepEqual([placed[1]?.line, placed[1]?.along, placed[1]?.dir], [1, 60, -1]);

  const first = retarget(new Map(), placed, 0, 15_000, false);
  assert.equal(alongAt(first.get("v40")!, 0), 40);
  const moved = placeLiveVehicles([at(50, 0, "#da291c")], lines, project).map((t) => ({ ...t, id: "v40" }));
  const second = retarget(first, moved, 1000, 15_000, false);
  assert.equal(alongAt(second.get("v40")!, 1000), 40);
  assert.equal(alongAt(second.get("v40")!, 8500), 45);
  assert.equal(alongAt(second.get("v40")!, 20_000), 50);
  // Reduced motion: no glide, the reported spot at once.
  const still = retarget(first, moved, 1000, 15_000, true);
  assert.equal(alongAt(still.get("v40")!, 1000), 50);

  const cars = consistPoses(lines[0]!.points, 40, 1, 3);
  assert.equal(cars.length, 3);
  assert.ok(cars[0]!.along > cars[1]!.along && cars[1]!.along > cars[2]!.along);
  assert.deepEqual([cars[0]!.dx, cars[0]!.dz], [0, -1]);
});

test("the live badge sits on the minimap and live trains are drawn by the rail layer", async () => {
  const minimap = await readFile("src/components/Minimap.tsx", "utf8");
  const badge = await readFile("src/components/LiveTransitBadge.tsx", "utf8");
  const layer = await readFile("src/showcase/scene/RailLayer.tsx", "utf8");
  assert.match(minimap, /<LiveTransitBadge \/>/);
  assert.match(badge, /Live: \{status\.label\} · updated \{time\}/);
  assert.match(layer, /useLiveTransit\(geoBounds, origin, tracks\.length > 0\)/);
});
