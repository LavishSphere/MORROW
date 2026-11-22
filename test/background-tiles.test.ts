import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  currentOverpassEndpoint,
  endpointOrder,
  mergeAreas,
  OVERPASS_ENDPOINTS,
  postOverpass,
  resetOverpassEndpoint,
  TILE_HALF,
  tileCenter,
  tileKey,
  tryNextEndpoint,
  type OsmWay,
} from "../src/data/overpass.ts";
import {
  BACKOFF_MS,
  REQUEST_GAP_MS,
  backoffDelay,
  givesUp,
  groundFootprint,
  nextTile,
  ringOrder,
  shouldCommit,
  URGENT_STILL_MS,
  viewTiles,
} from "../src/data/tileQueue.ts";
import { uncoveredParts } from "../src/data/overtureBuildings.ts";

test("a tile's download box is centered on the tile, so neighbors meet edge to edge", () => {
  const points: [number, number][] = [
    [-71.0589, 42.3601],
    [-115.1398, 36.1699],
    [-0.0001, 0.0001],
  ];
  for (const [lng, lat] of points) {
    const key = tileKey(lng, lat);
    const [cx, cy] = tileCenter(key);
    assert.equal(tileKey(cx, cy), key);
    // The camera point sits inside its tile's box.
    assert.ok(Math.abs(lng - cx) <= TILE_HALF + 1e-9);
    assert.ok(Math.abs(lat - cy) <= TILE_HALF + 1e-9);
  }
  const [ax] = tileCenter("-5474:3258");
  const [bx] = tileCenter("-5473:3258");
  // East edge of one tile is the west edge of the next.
  assert.ok(Math.abs(ax + TILE_HALF - (bx - TILE_HALF)) < 1e-9);
});

test("background tiles go in square rings, in front of the camera first", () => {
  const order = ringOrder("0:0", 2);
  assert.equal(order.length, 25);
  assert.equal(order[0], "0:0");
  assert.equal(new Set(order).size, 25);
  const ring = (key: string) => {
    const [x, y] = key.split(":").map(Number);
    return Math.max(Math.abs(x!), Math.abs(y!));
  };
  assert.deepEqual(order.slice(1, 9).map(ring), Array(8).fill(1));
  assert.deepEqual(order.slice(9).map(ring), Array(16).fill(2));
  // Facing north from the middle: the tile straight ahead comes first in each ring.
  const north = ringOrder("0:0", 2, { x: 0, y: 0, dirX: 0, dirY: 1 });
  assert.equal(north[1], "0:1");
  assert.equal(north[9], "0:2");
  assert.equal(north[8], "0:-1");
});

test("edge-of-view tiles jump the queue; done tiles are skipped", () => {
  const done = new Set(["0:0", "5:5"]);
  const skip = (key: string) => done.has(key);
  assert.deepEqual(nextTile({ urgent: ["5:5", "9:9"], view: ["1:1"], background: ["0:0", "0:1"], skip }), {
    key: "9:9",
    urgent: true,
  });
  assert.deepEqual(nextTile({ urgent: [], view: ["0:0", "1:1"], background: ["0:1"], skip }), {
    key: "1:1",
    urgent: false,
  });
  assert.deepEqual(nextTile({ urgent: [], background: ["0:0", "0:1"], skip }), { key: "0:1", urgent: false });
  assert.equal(nextTile({ urgent: [], background: ["0:0"], skip }), null);
});

test("failures back off 5 s, 15 s, then 60 s, and a tile is given up after two retries", () => {
  assert.equal(backoffDelay(0), REQUEST_GAP_MS);
  assert.deepEqual([1, 2, 3, 4, 10].map(backoffDelay), [5000, 15000, 60000, 60000, 60000]);
  assert.deepEqual([...BACKOFF_MS], [5000, 15000, 60000]);
  assert.equal(givesUp(1), false);
  assert.equal(givesUp(2), false);
  assert.equal(givesUp(3), true);
});

test("background tiles join the city in batches, only while the camera is still", () => {
  const base = { pending: 1, urgent: false, sinceCommitMs: 0, stillMs: 5000 };
  assert.equal(shouldCommit({ ...base, pending: 0 }), false);
  assert.equal(shouldCommit(base), false);
  assert.equal(shouldCommit({ ...base, pending: 3 }), true);
  assert.equal(shouldCommit({ ...base, sinceCommitMs: 9000 }), true);
  // Moving: wait, however many are ready.
  assert.equal(shouldCommit({ ...base, pending: 5, stillMs: 200 }), false);
  // The tile you are walking toward goes in at the first short pause, never mid-move.
  assert.equal(shouldCommit({ ...base, urgent: true, stillMs: 0 }), false);
  assert.equal(shouldCommit({ ...base, urgent: true, stillMs: URGENT_STILL_MS }), true);
  // A pause between two scrolls is not a rest.
  assert.equal(shouldCommit({ ...base, pending: 5, stillMs: 2000 }), false);
});

// A flat map like the city's: 0.14 scene units per meter, centered on 0, 0.
const SCALE = 0.14 * 111_320;
const unproject = (x: number, z: number) => [x / SCALE, -z / SCALE] as const;
const project = (lng: number, lat: number) => [lng * SCALE, -lat * SCALE] as const;
const TILE = TILE_HALF * 2;

test("the visible ground stops at the fog, even looking at the horizon", () => {
  const ground = groundFootprint({ eye: [0, 5, 0], target: [0, 5, -10], fov: 34, aspect: 1.6 }, 340);
  assert.ok(ground.length >= 4);
  for (const [x, z] of ground) assert.ok(Math.hypot(x, z) <= 340 + 1e-6);
  // Looking north (−z): nothing it sees is behind the camera.
  assert.ok(ground.every(([, z]) => z <= 1e-6));
});

test("every tile the camera can see is queued, nearest to the view first", () => {
  // Looking north over the middle tile, low enough to see the next one.
  const camera = { eye: [0, 20, 80] as const, target: [0, 0, 0] as const, fov: 34, aspect: 1.6 };
  const keys = viewTiles({ camera, far: 340, tileDeg: TILE, unproject, project });
  assert.equal(keys[0], "0:0");
  assert.equal(new Set(keys).size, keys.length);
  // The tile ahead (north) is seen; the one far behind the camera is not.
  assert.ok(keys.includes("0:1"));
  assert.ok(!keys.includes("0:-3"));
  // Nearest first.
  const dist = (key: string) => {
    const [i, j] = key.split(":").map(Number);
    const [ax, az] = project((i! - 0.5) * TILE, (j! - 0.5) * TILE);
    const [bx, bz] = project((i! + 0.5) * TILE, (j! + 0.5) * TILE);
    const dx = Math.max(Math.min(ax, bx), 0, -Math.max(ax, bx));
    const dz = Math.max(Math.min(az, bz), 0, -Math.max(az, bz));
    return Math.hypot(dx, dz);
  };
  for (let i = 1; i < keys.length; i += 1) assert.ok(dist(keys[i]!) >= dist(keys[i - 1]!) - 1e-9);
  // Turning around shows the south instead.
  const south = viewTiles({
    camera: { ...camera, eye: [0, 20, -80] },
    far: 340,
    tileDeg: TILE,
    unproject,
    project,
  });
  assert.ok(south.includes("0:-1"));
  assert.ok(!south.includes("0:2"));
  // The cap holds.
  assert.ok(viewTiles({ camera, far: 340, tileDeg: TILE, unproject, project, maxTiles: 2 }).length <= 2);
});

test("new tiles merge without duplicating ways shared across an edge", () => {
  const way = (id: number): OsmWay => ({ id, name: null, kind: "road", points: [[0, 0], [0, 1]] });
  const base = { place: { label: "X", lng: 0, lat: 0 }, note: "", ways: [way(1)], tiles: [] as string[] };
  const next = mergeAreas(base, [way(1), way(2), way(2), way(3)], ["0:0", "0:1"]);
  assert.deepEqual(next.ways.map((w) => w.id), [1, 2, 3]);
  assert.deepEqual(next.tiles, ["0:0", "0:1"]);
  assert.equal(mergeAreas({ ...base, procedural: true }, [way(9)], ["1:1"]).ways.length, 1);
});

test("Overpass falls back through its servers and sticks with the one that answered", async () => {
  resetOverpassEndpoint();
  assert.deepEqual(endpointOrder(null), [...OVERPASS_ENDPOINTS]);
  assert.deepEqual(endpointOrder(OVERPASS_ENDPOINTS[2]), [
    OVERPASS_ENDPOINTS[2],
    OVERPASS_ENDPOINTS[0],
    OVERPASS_ENDPOINTS[1],
  ]);
  assert.deepEqual(endpointOrder("https://elsewhere.example/api"), [...OVERPASS_ENDPOINTS]);
  for (const status of [403, 429, 500, 502, 504]) assert.equal(tryNextEndpoint(status), true);
  assert.equal(tryNextEndpoint(400), false);

  const asked: string[] = [];
  const answers: Record<string, () => Response> = {
    [OVERPASS_ENDPOINTS[0]]: () => new Response("only available to white-listed usages", { status: 403 }),
    [OVERPASS_ENDPOINTS[1]]: () => {
      throw new TypeError("network down");
    },
    [OVERPASS_ENDPOINTS[2]]: () => new Response(JSON.stringify({ elements: [] }), { status: 200 }),
  };
  const send = (async (url: string) => {
    asked.push(url);
    return answers[url]!();
  }) as unknown as typeof fetch;
  assert.deepEqual(await postOverpass("q", undefined, send), { elements: [] });
  assert.deepEqual(asked, [...OVERPASS_ENDPOINTS] as string[]);
  assert.equal(currentOverpassEndpoint(), OVERPASS_ENDPOINTS[2]);
  // Later requests go straight to the server that worked.
  asked.length = 0;
  await postOverpass("q", undefined, send);
  assert.deepEqual(asked, [OVERPASS_ENDPOINTS[2] as string]);
  // A bad query is not retried elsewhere.
  resetOverpassEndpoint();
  asked.length = 0;
  const bad = (async (url: string) => {
    asked.push(url);
    return new Response("bad", { status: 400 });
  }) as unknown as typeof fetch;
  await assert.rejects(postOverpass("q", undefined, bad), /Overpass 400/);
  assert.equal(asked.length, 1);
  // A cancel stops at once.
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(postOverpass("q", abort.signal, send));
  resetOverpassEndpoint();
});

test("Overture reads only ground it has not read before", () => {
  const box = { west: 0, south: 0, east: 2, north: 2 };
  assert.deepEqual(uncoveredParts(box, []), [box]);
  assert.deepEqual(uncoveredParts(box, [box]), []);
  const parts = uncoveredParts({ west: 0, south: 0, east: 3, north: 2 }, [box]);
  assert.deepEqual(parts, [{ west: 2, south: 0, east: 3, north: 2 }]);
  // Slivers along an edge already read are skipped.
  assert.deepEqual(uncoveredParts({ west: 0, south: 0, east: 2.001, north: 2 }, [box], 0.0015), []);
  const area = uncoveredParts({ west: -1, south: -1, east: 3, north: 3 }, [box]).reduce(
    (sum, p) => sum + (p.east - p.west) * (p.north - p.south),
    0,
  );
  assert.ok(Math.abs(area - (16 - 4)) < 1e-9);
});

test("the city loads the rest of a place in the background, paced and cancellable", async () => {
  const hook = await readFile("src/data/useCityStreaming.ts", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const overture = await readFile("src/data/overtureBuildings.ts", "utf8");
  assert.match(hook, /viewTiles\(/);
  assert.match(hook, /new AbortController\(\)/);
  assert.match(hook, /whenIdle\(commit\)/);
  assert.match(hook, /latest\.current = next/);
  assert.match(city, /uncoveredParts\(/);
  assert.match(city, /\}, \[boxKey, placeKey\]\);/);
  assert.match(city, /new RingIndex\(model\.parsed\.buildings\)/);
  assert.match(overture, /let stacIndex/);
});
