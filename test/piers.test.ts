import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { deckAroundLine, piersFromRow, withPiers } from "../src/data/overturePiers.ts";

const LAT = 37.7955;
const LON = -122.3937;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT * Math.PI) / 180);

test("a pier mapped as a line becomes a closed deck about 6 m wide", () => {
  // 100 m due east.
  const line: [number, number][] = [
    [LON, LAT],
    [LON + 100 / M_PER_DEG_LON, LAT],
  ];
  const ring = deckAroundLine(line);
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  const lats = ring.map((p) => p[1]);
  const widthM = (Math.max(...lats) - Math.min(...lats)) * 111_320;
  assert.ok(Math.abs(widthM - 6) < 0.01, `width ${widthM}`);
  const lons = ring.map((p) => p[0]);
  assert.ok(Math.abs((Math.max(...lons) - Math.min(...lons)) * M_PER_DEG_LON - 100) < 0.01);
  // A bent pier keeps both arms half a width from the line.
  const bent = deckAroundLine([...line, [LON + 100 / M_PER_DEG_LON, LAT + 50 / 111_320]]);
  assert.equal(bent.length, 7);
  assert.deepEqual(deckAroundLine([[LON, LAT]]), []);
});

test("Overture infrastructure rows: piers kept as polygons or widened lines, others skipped", () => {
  const square = [
    [LON, LAT],
    [LON + 0.0005, LAT],
    [LON + 0.0005, LAT + 0.0005],
    [LON, LAT + 0.0005],
    [LON, LAT],
  ];
  const polygon = piersFromRow({ id: "a", class: "pier", geometry: { type: "Polygon", coordinates: [square] } });
  assert.equal(polygon.length, 1);
  assert.equal(polygon[0]?.ring.length, 5);
  const line = piersFromRow({
    id: "b",
    class: "pier",
    geometry: { type: "LineString", coordinates: [square[0], square[1]] },
  });
  assert.equal(line.length, 1);
  assert.equal(line[0]?.ring.length, 5);
  assert.deepEqual(piersFromRow({ id: "c", class: "bridge", geometry: { type: "Polygon", coordinates: [square] } }), []);
  assert.deepEqual(piersFromRow({ id: "d", class: "pier", geometry: { type: "Point", coordinates: [LON, LAT] } }), []);
});

test("pier features parse into their own layer and are drawn as a deck above the water", async () => {
  const geo = withPiers({ type: "FeatureCollection", features: [] }, [
    { id: "a", ring: deckAroundLine([[LON, LAT], [LON + 0.001, LAT]]) },
  ]) as { features: { properties: { layer: string } }[] };
  assert.equal(geo.features[0]?.properties.layer, "pier");
  const parser = await readFile("src/showcase/scene/parseBasemap.ts", "utf8");
  assert.match(parser, /layer === "pier" \|\|/);
  assert.match(parser, /"sand" \| "pier" \| "tree">/);
  assert.match(parser, /if \(layer === "pier" && f\.geometry\.type === "Polygon"\)[\s\S]*?piers\.push\(ring\)/);
  assert.match(parser, /layer !== "pier" &&/);
  assert.match(parser, /\.\.\.\(piers\.length \? \{ piers \} : \{\}\)/);
  // Without piers the map is passed through untouched.
  const plain = { type: "FeatureCollection", features: [] };
  assert.equal(withPiers(plain, []), plain);
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(city, /for \(const ring of model\.parsed\.piers \?\? \[\]\)/);
  assert.match(city, /cap\(decks, ring, PIER_DECK_Y\);\s+walls\(decks, ring, 0, PIER_DECK_Y\);\s+occupancy\.markPolygon\(\[ring\]\);/);
  assert.match(city, /fetchOverturePiers\(part\)/);
});
