import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { decodeVehiclePositions } from "../src/transit/gtfsRealtime.ts";
import {
  createTransitProxy,
  TransitFeedError,
  vehiclesFromCtaTrainTracker,
  vehiclesFromGtfsRt,
} from "../src/transit/proxy.ts";
import { setTransitProxy } from "../src/routes/transit.ts";
import { createApiServer } from "../src/server.ts";
import { findTransitFeed, TRANSIT_FEEDS } from "../../../shared/transitFeeds.ts";

// Tiny protobuf writer for GTFS-realtime fixtures.
function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
}
const tag = (field: number, wt: number) => varint(field * 8 + wt);
const uint = (field: number, n: number) => [...tag(field, 0), ...varint(n)];
const msg = (field: number, body: number[]) => [...tag(field, 2), ...varint(body.length), ...body];
const str = (field: number, s: string) => msg(field, [...new TextEncoder().encode(s)]);
function f32(field: number, x: number): number[] {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setFloat32(0, x, true);
  return [...tag(field, 5), ...b];
}

const NOW_S = 1_795_324_650;
const NOW_MS = NOW_S * 1000;

type VehicleFixture = {
  entity: string;
  trip?: string;
  route?: string;
  lat: number;
  lon: number;
  bearing?: number;
  status?: number;
  timestamp?: number;
  vehicleId?: string;
};

function vehicleEntity(v: VehicleFixture): number[] {
  const trip = [...(v.trip ? str(1, v.trip) : []), ...(v.route ? str(5, v.route) : [])];
  const position = [...f32(1, v.lat), ...f32(2, v.lon), ...(v.bearing !== undefined ? f32(3, v.bearing) : [])];
  return msg(2, [
    ...str(1, v.entity),
    ...msg(4, [
      ...msg(1, trip),
      ...msg(2, position),
      ...(v.status !== undefined ? uint(4, v.status) : []),
      ...(v.timestamp !== undefined ? uint(5, v.timestamp) : []),
      ...(v.vehicleId ? msg(8, str(1, v.vehicleId)) : []),
      // An agency extension the decoder must skip.
      ...msg(1005, str(1, "ignored")),
    ]),
  ]);
}

function tripUpdateEntity(entity: string, trip: string, route: string): number[] {
  return msg(2, [...str(1, entity), ...msg(3, [...msg(1, [...str(1, trip), ...str(5, route)])])]);
}

function feed(...entities: number[][]): Uint8Array {
  const header = msg(1, [...str(1, "2.0"), ...uint(3, NOW_S)]);
  return new Uint8Array([...header, ...entities.flat()]);
}

test("decoder reads vehicle positions and skips unknown fields", () => {
  const decoded = decodeVehiclePositions(
    feed(
      vehicleEntity({
        entity: "e1",
        trip: "t1",
        route: "Red",
        lat: 41.88,
        lon: -87.63,
        bearing: 90,
        status: 1,
        timestamp: NOW_S - 5,
        vehicleId: "car-7",
      }),
    ),
  );
  assert.equal(decoded.timestamp, NOW_S);
  assert.equal(decoded.vehicles.length, 1);
  const v = decoded.vehicles[0];
  assert.ok(v);
  assert.equal(v.entityId, "e1");
  assert.equal(v.vehicleId, "car-7");
  assert.equal(v.routeId, "Red");
  assert.equal(v.currentStatus, "STOPPED_AT");
  assert.equal(v.timestamp, NOW_S - 5);
  assert.ok(Math.abs((v.lat ?? 0) - 41.88) < 1e-4);
  assert.ok(Math.abs((v.lon ?? 0) + 87.63) < 1e-4);
  assert.equal(v.bearing, 90);
});

test("decoder fills route ids from trip updates by trip id or entity id", () => {
  const decoded = decodeVehiclePositions(
    feed(
      // LIRR style: the trip update shares the vehicle's trip_id.
      tripUpdateEntity("tu-1", "GO1", "4"),
      vehicleEntity({ entity: "v-1", trip: "GO1", lat: 40.7, lon: -73.4 }),
      // Metro-North style: the vehicle's trip_id is the update's entity id.
      tripUpdateEntity("6369", "3272584", "3"),
      vehicleEntity({ entity: "v-2", trip: "6369", lat: 40.75, lon: -73.97 }),
    ),
  );
  assert.deepEqual(
    decoded.vehicles.map((v) => [v.entityId, v.routeId, v.timestamp]),
    [
      ["v-1", "4", NOW_S],
      ["v-2", "3", NOW_S],
    ],
  );
});

test("decoder rejects truncated input", () => {
  const bytes = feed(vehicleEntity({ entity: "e", lat: 1, lon: 1 }));
  assert.throws(() => decodeVehiclePositions(bytes.subarray(0, bytes.length - 3)));
});

test("rail-only feeds drop buses, stale and null-island positions", () => {
  const metro = findTransitFeed("metro-transit");
  assert.ok(metro);
  const vehicles = vehiclesFromGtfsRt(
    metro,
    feed(
      vehicleEntity({ entity: "a", route: "901", lat: 44.95, lon: -93.24, vehicleId: "lrv1", timestamp: NOW_S }),
      vehicleEntity({ entity: "b", route: "10", lat: 44.98, lon: -93.27, timestamp: NOW_S }),
      vehicleEntity({ entity: "c", route: "902", lat: 44.95, lon: -93.1, timestamp: NOW_S - 3600 }),
      vehicleEntity({ entity: "d", route: "902", lat: 0, lon: 0, timestamp: NOW_S }),
    ),
    NOW_MS,
  );
  assert.deepEqual(vehicles, [
    {
      id: "metro-transit:lrv1",
      lat: 44.95,
      lon: -93.24,
      bearing: null,
      routeId: "901",
      color: "#00539F",
      status: null,
      updatedAt: new Date(NOW_MS).toISOString(),
    },
  ]);
});

test("CTA Train Tracker JSON accepts single trains and maps line codes", () => {
  const cta = findTransitFeed("cta");
  assert.ok(cta);
  const body = {
    ctatt: {
      errCd: "0",
      route: [
        { "@name": "red", train: { rn: "812", lat: "41.97776", lon: "-87.90421", heading: "308", isApp: "1" } },
        { "@name": "brn", train: [{ rn: "401", lat: "41.9", lon: "-87.65", heading: "90", isApp: "0" }] },
        { "@name": "y" },
      ],
    },
  };
  const vehicles = vehiclesFromCtaTrainTracker(cta, body, NOW_MS);
  assert.deepEqual(
    vehicles.map((v) => [v.id, v.routeId, v.color, v.status, v.bearing]),
    [
      ["cta:812", "Red", "#C60C30", "INCOMING_AT", 308],
      ["cta:401", "Brn", "#62361B", "IN_TRANSIT_TO", 90],
    ],
  );
  assert.throws(
    () => vehiclesFromCtaTrainTracker(cta, { ctatt: { errCd: "101", errNm: "Invalid API key" } }, NOW_MS),
    /Invalid API key/,
  );
});

function fakeFetch(bodies: Record<string, Uint8Array | string | number>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const impl = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const match = Object.keys(bodies).find((prefix) => url.startsWith(prefix));
    const body = match === undefined ? 404 : bodies[match];
    if (typeof body === "number") return new Response("nope", { status: body });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

test("proxy caches per feed and merges every source", async () => {
  let now = NOW_MS;
  const septaRail = feed(vehicleEntity({ entity: "r", route: "AIR", lat: 40, lon: -75.2, timestamp: NOW_S }));
  const septaBus = feed(
    vehicleEntity({ entity: "t", route: "T1", lat: 39.96, lon: -75.2, timestamp: NOW_S }),
    vehicleEntity({ entity: "bus", route: "21", lat: 39.95, lon: -75.17, timestamp: NOW_S }),
  );
  const { impl, calls } = fakeFetch({
    "https://www3.septa.org/gtfsrt/septarail": septaRail,
    "https://www3.septa.org/gtfsrt/septa-pa": septaBus,
  });
  const proxy = createTransitProxy({ fetch: impl, env: {}, now: () => now });
  const first = await proxy.vehicles("septa");
  assert.deepEqual(first.map((v) => v.routeId), ["AIR", "T1"]);
  assert.equal(calls.length, 2);
  now += 5_000;
  await proxy.vehicles("septa");
  assert.equal(calls.length, 2, "served from cache inside 10 s");
  now += 6_000;
  await proxy.vehicles("septa");
  assert.equal(calls.length, 4, "refetched after the cache expired");
});

test("proxy sends keys from env and refuses keyed feeds without one", async () => {
  const body = feed(vehicleEntity({ entity: "w", route: "RED", lat: 38.9, lon: -77.03, timestamp: NOW_S }));
  const { impl, calls } = fakeFetch({ "https://api.wmata.com/": body, "https://gtfspublic.metrarr.com/": body });

  const unkeyed = createTransitProxy({ fetch: impl, env: {}, now: () => NOW_MS });
  await assert.rejects(unkeyed.vehicles("wmata"), (err: unknown) => {
    assert.ok(err instanceof TransitFeedError);
    assert.equal(err.status, 501);
    assert.match(err.message, /WMATA_API_KEY/);
    return true;
  });
  assert.equal(calls.length, 0);

  const keyed = createTransitProxy({
    fetch: impl,
    env: { WMATA_API_KEY: "wm-test", METRA_API_TOKEN: "metra-test" },
    now: () => NOW_MS,
  });
  const wmata = await keyed.vehicles("wmata");
  assert.equal(wmata[0]?.color, "#BF0D3E");
  assert.equal(calls[0]?.headers.api_key, "wm-test");
  assert.equal(calls[0]?.url.includes("wm-test"), false, "header key stays out of the URL");
  await keyed.vehicles("metra");
  assert.match(calls[1]?.url ?? "", /api_token=metra-test/);

  await assert.rejects(keyed.vehicles("nowhere"), (err: unknown) => {
    assert.ok(err instanceof TransitFeedError);
    assert.equal(err.status, 404);
    return true;
  });
});

test("proxy serves the last good answer briefly when the upstream fails", async () => {
  let now = NOW_MS;
  let up = true;
  const good = feed(vehicleEntity({ entity: "a", route: "901", lat: 44.95, lon: -93.24, timestamp: NOW_S }));
  const impl = (async () =>
    up ? new Response(good, { status: 200 }) : new Response("down", { status: 503 })) as typeof fetch;
  const proxy = createTransitProxy({ fetch: impl, env: {}, now: () => now });
  assert.equal((await proxy.vehicles("metro-transit")).length, 1);
  up = false;
  now += 30_000;
  assert.equal((await proxy.vehicles("metro-transit")).length, 1);
  now += 120_000;
  await assert.rejects(proxy.vehicles("metro-transit"), (err: unknown) => {
    assert.ok(err instanceof TransitFeedError);
    assert.equal(err.status, 502);
    return true;
  });
});

test("proxy reports an upstream timeout as 504", async () => {
  const impl = ((_url: URL | string | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })) as typeof fetch;
  const proxy = createTransitProxy({ fetch: impl, env: {}, timeoutMs: 20 });
  await assert.rejects(proxy.vehicles("rtd"), (err: unknown) => {
    assert.ok(err instanceof TransitFeedError);
    assert.equal(err.status, 504);
    return true;
  });
});

test("every feed has a bbox, a poll of at least 15 s and #rrggbb colours", () => {
  const ids = new Set<string>();
  for (const f of TRANSIT_FEEDS) {
    assert.equal(ids.has(f.id), false, `duplicate feed ${f.id}`);
    ids.add(f.id);
    assert.ok(f.pollMs >= 15_000, f.id);
    assert.ok(f.bbox.west < f.bbox.east && f.bbox.south < f.bbox.north, f.id);
    assert.ok(f.sources.length > 0, f.id);
    for (const color of Object.values(f.routes)) assert.match(color, /^#[0-9A-F]{6}$/i);
    assert.equal(f.sources.some((s) => /key=|token=|appID=/i.test(s.url)), false, "no keys in URLs");
  }
});

const server = createApiServer();
let baseUrl = "";

before(async () => {
  delete process.env.WMATA_API_KEY;
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("GET /api/transit/vehicles validates the feed and answers JSON with CORS", async () => {
  const missing = await fetch(`${baseUrl}/api/transit/vehicles`);
  assert.equal(missing.status, 400);

  const unknown = await fetch(`${baseUrl}/api/transit/vehicles?feed=nowhere`);
  assert.equal(unknown.status, 404);

  const unkeyed = await fetch(`${baseUrl}/api/transit/vehicles?feed=wmata`);
  assert.equal(unkeyed.status, 501);
  assert.match(((await unkeyed.json()) as { error: string }).error, /WMATA_API_KEY/);

  const body = feed(vehicleEntity({ entity: "a", route: "902", lat: 44.95, lon: -93.1, timestamp: NOW_S }));
  setTransitProxy(
    createTransitProxy({
      fetch: (async () => new Response(body, { status: 200 })) as typeof fetch,
      env: {},
      now: () => NOW_MS,
    }),
  );
  try {
    const ok = await fetch(`${baseUrl}/api/transit/vehicles?feed=metro-transit`, {
      headers: { origin: "https://example.org" },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("access-control-allow-origin"), "*");
    const vehicles = (await ok.json()) as Array<{ id: string; color: string }>;
    assert.deepEqual(
      vehicles.map((v) => [v.id, v.color]),
      [["metro-transit:a", "#008144"]],
    );
  } finally {
    setTransitProxy(createTransitProxy());
  }
});
