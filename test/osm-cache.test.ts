import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { acceptableQuery } from "../packages/api/src/routes/osm.ts";
import { coastQuery, firstViewQueries, ringTiles, tileKey, tileQuery } from "../shared/osmQueries.ts";

test("the browser and the API build the same query text for a place, so the API cache hits", async () => {
  // A place anywhere in a tile gives that tile's exact query.
  const a = firstViewQueries(-71.0589, 42.3601);
  const b = firstViewQueries(-71.0589 + 0.002, 42.3601 - 0.002);
  assert.equal(tileKey(-71.0589, 42.3601), tileKey(-71.0569, 42.3581));
  assert.deepEqual(a, b);
  assert.equal(a[0], tileQuery(tileKey(-71.0589, 42.3601)));
  assert.equal(a[1], coastQuery(tileKey(-71.0589, 42.3601)));
  assert.equal(ringTiles(0, 0, 1).length, 8);
  const loader = await readFile("src/data/overpass.ts", "utf8");
  assert.match(loader, /from '\.\.\/\.\.\/shared\/osmQueries\.ts'/);
  // The first view is the place's own tile, with coast and bridges at the same time.
  assert.match(loader, /const coastAndBridges = Promise\.all\(/);
});

test("the API only relays Overpass JSON queries, keeps answers on disk, and pre-loads major cities", async () => {
  assert.equal(acceptableQuery(tileQuery("1:1")), true);
  assert.equal(acceptableQuery("<osm-script/>"), false);
  assert.equal(acceptableQuery("[out:json]" + "x".repeat(20_000)), false);
  assert.equal(acceptableQuery(42), false);
  const osm = await readFile("packages/api/src/routes/osm.ts", "utf8");
  const server = await readFile("packages/api/src/server.ts", "utf8");
  const index = await readFile("packages/api/src/index.ts", "utf8");
  assert.match(osm, /"user-agent": USER_AGENT/);
  assert.match(osm, /const inflight = new Map/);
  assert.match(osm, /\/home\/container\/osm-cache/);
  assert.match(server, /pathname === "\/api\/osm"/);
  assert.match(index, /warmMajorCities\(/);
  // Browsers ask the API first and give up on a silent public server after 20 s.
  const loader = await readFile("src/data/overpass.ts", "utf8");
  assert.match(loader, /const cached = await viaApi\(query, signal\)/);
  assert.match(loader, /const FIRST_BYTE_MS = 20000/);
});

test("visitors jump ahead of pre-loading, which uses at most one download slot", async () => {
  const osm = await readFile("packages/api/src/routes/osm.ts", "utf8");
  assert.match(osm, /return !background \|\| \(busyBackground < 1 && waitingLive\.length === 0\);/);
  assert.match(osm, /await osmAnswer\(query, true\)/);
  const { MAJOR_CITIES } = await import("../shared/osmQueries.ts");
  assert.ok(MAJOR_CITIES.length >= 60);
  assert.equal(new Set(MAJOR_CITIES).size, MAJOR_CITIES.length);
  assert.equal(MAJOR_CITIES[0], "Boston, MA");
});
