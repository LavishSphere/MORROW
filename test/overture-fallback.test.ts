import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { linesOf, outerRingsOf, overtureNumber, waterFromRow, wayFromSegment } from "../src/data/overtureBase.ts";
import { fromOverture } from "../src/data/overpass.ts";

const line = { type: "LineString", coordinates: [[-71.06, 42.36], [-71.059, 42.361]] };

test("Overture segments become the same street, path, and rail ways the loader draws", () => {
  const sidewalk = wayFromSegment({ id: "a", subtype: "road", class: "footway", subclass: "sidewalk", geometry: line, road_surface: [{ value: "paved", between: null }] });
  assert.equal(sidewalk[0]?.highway, "footway");
  assert.equal(sidewalk[0]?.tags?.footway, "sidewalk");
  assert.equal(wayFromSegment({ id: "b", subtype: "road", class: "footway", subclass: "crosswalk", geometry: line })[0]?.tags?.footway, "crossing");
  assert.equal(wayFromSegment({ id: "c", subtype: "road", class: "steps", geometry: line })[0]?.highway, "steps");
  assert.equal(wayFromSegment({ id: "d", subtype: "road", class: "primary", subclass: "link", geometry: line })[0]?.highway, "primary_link");
  assert.equal(wayFromSegment({ id: "e", subtype: "road", class: "path", geometry: line, road_surface: [{ value: "gravel", between: null }] })[0]?.tags?.surface, "unpaved");
  assert.equal(wayFromSegment({ id: "f", subtype: "road", class: "primary", geometry: line, road_flags: [{ values: ["is_bridge"], between: null }] })[0]?.tags?.bridge, "yes");
  // Tunnels are not drawn on the ground; unknown classes are skipped.
  assert.equal(wayFromSegment({ id: "g", subtype: "road", class: "primary", geometry: line, road_flags: [{ values: ["is_tunnel"], between: null }] }).length, 0);
  assert.equal(wayFromSegment({ id: "h", subtype: "road", class: "unknown", geometry: line }).length, 0);
  assert.equal(wayFromSegment({ id: "i", subtype: "rail", class: "subway", geometry: line })[0]?.kind, "rail");
  // Overture ids become negative numbers, so they never collide with OSM ids, and the note can tell.
  assert.ok(overtureNumber("abc") < 0);
  assert.equal(overtureNumber("abc"), overtureNumber("abc"));
  assert.equal(fromOverture(sidewalk), true);
});

test("Overture water areas are kept, pools and fountains are not, and geometry reads as GeoJSON", () => {
  const square = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  assert.equal(waterFromRow({ id: "w", class: "ocean", geometry: square })[0]?.kind, "water");
  assert.equal(waterFromRow({ id: "p", class: "swimming_pool", geometry: square }).length, 0);
  assert.equal(linesOf({ type: "MultiLineString", coordinates: [line.coordinates, line.coordinates] }).length, 2);
  assert.equal(outerRingsOf({ type: "MultiPolygon", coordinates: [square.coordinates] }).length, 1);
});

test("a tile Overpass cannot serve falls back to Overture, and the place note says so", async () => {
  const loader = await readFile("src/data/overpass.ts", "utf8");
  assert.match(loader, /const \{ fetchOvertureBase \} = await import\('\.\/overtureBase\.ts'\)/);
  assert.match(loader, /streets and water come from Overture Maps/);
});

test("an uncached coastline falls back to Overture water, clipped to the coast box", async () => {
  const { clipRing } = await import("../src/data/overtureBase.ts");
  const box = { west: 0, south: 0, east: 1, north: 1 };
  const big: [number, number][] = [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]];
  const clipped = clipRing(big, box);
  assert.ok(clipped.length >= 5);
  for (const [x, y] of clipped) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
  assert.deepEqual(clipRing([[3, 3], [4, 3], [4, 4], [3, 3]], box), []);
  const loader = await readFile("src/data/overpass.ts", "utf8");
  assert.match(loader, /const \{ fetchOvertureWater \} = await import\('\.\/overtureBase\.ts'\)/);
});
