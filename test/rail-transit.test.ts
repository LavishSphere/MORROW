import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { neighborhoodGeoJson, waysFromOverpass } from "../src/data/overpass.ts";
import {
  colourForRef,
  dashLine,
  isMinorTrack,
  isUnderground,
  lineColour,
  nearestOnPolyline,
  normalizeColour,
  offsetPolyline,
  parseRail,
  pointAlong,
  polylineLength,
  railRefsFrom,
  snapToLines,
  type Pt,
} from "../src/data/rail.ts";

const line = (a: [number, number], b: [number, number]) => [
  { lat: a[1], lon: a[0] },
  { lat: b[1], lon: b[0] },
];

test("rail ways pick up their route relation's colour and ref", () => {
  const ways = waysFromOverpass({
    elements: [
      { type: "way", id: 10, tags: { railway: "subway", tunnel: "yes", layer: "-2" }, geometry: line([-71.06, 42.35], [-71.061, 42.356]) },
      { type: "way", id: 11, tags: { railway: "rail", name: "Worcester Main Line" }, geometry: line([-71.1, 42.34], [-71.09, 42.345]) },
      { type: "way", id: 12, tags: { railway: "rail", service: "yard" }, geometry: line([-71.1, 42.34], [-71.1, 42.341]) },
      { type: "railref", id: 1, tags: { way: "10", colour: "#DA291C", ref: "Red", network: "MBTA" } },
      { type: "railref", id: 2, tags: { way: "11", colour: "", ref: "CR-Worcester;Lake Shore Limited", network: "MBTA;Amtrak" } },
    ],
  });
  assert.deepEqual(
    ways.map((w) => w.kind),
    ["rail", "rail", "rail"],
  );
  const red = ways.find((w) => w.id === 10)!;
  assert.equal(red.lineColour, "#da291c");
  assert.equal(red.lineRef, "Red");
  // OSM `layer` never overwrites our feature layer.
  assert.equal(red.tags?.["layer:osm"], "-2");
  assert.equal(red.tags?.layer, undefined);
  assert.equal(ways.find((w) => w.id === 11)?.lineColour, "#80276c");
  assert.equal(ways.find((w) => w.id === 12)?.lineColour, null);
  assert.ok(isMinorTrack(ways.find((w) => w.id === 12)!.tags!));
});

test("railref rows merge by way id and the fallback table covers many systems", () => {
  const refs = railRefsFrom([
    { type: "railref", tags: { way: "5", colour: "#00843D", ref: "Green-B" } },
    { type: "railref", tags: { way: "5", colour: "#00843D", ref: "Green-C" } },
    { type: "way", id: 5 },
  ]);
  assert.deepEqual(refs.get(5), { colours: ["#00843D"], refs: ["Green-B", "Green-C"], networks: [] });
  assert.equal(lineColour({}, refs.get(5)), "#00843d");
  // The way's own colour wins.
  assert.equal(lineColour({ colour: "#123456" }, refs.get(5)), "#123456");

  assert.equal(colourForRef("Green-D"), "#00843d");
  assert.equal(colourForRef("Red", "MBTA"), "#da291c");
  assert.equal(colourForRef("Yellow", "BART"), "#ffe600");
  assert.equal(colourForRef("A", "NYC Subway"), "#0039a6");
  assert.equal(colourForRef("7", "NYC Subway"), "#b933ad");
  assert.equal(colourForRef("Brn", "CTA"), "#62361b");
  assert.equal(colourForRef("SV", "WMATA"), "#919d9d");
  assert.equal(colourForRef("E", "LA Metro"), "#fdb913");
  assert.equal(colourForRef("Red", "DART"), "#ce0e2d");
  assert.equal(colourForRef("N", "Muni"), "#005b95");
  assert.equal(colourForRef("MFL", "SEPTA"), "#00a1de");
  // A bare letter means nothing without a system; a colour word does.
  assert.equal(colourForRef("A"), null);
  assert.equal(colourForRef("Purple Line"), "#7b3f98");
  // Amtrak is neutral track.
  assert.equal(lineColour({ ref: "Northeast Regional" }, { colours: [], refs: ["Acela"], networks: ["Amtrak"] }), null);
  assert.equal(normalizeColour("red"), "#d52b1e");
  assert.equal(normalizeColour("#ABC"), "#aabbcc");
  assert.equal(normalizeColour("DA291C"), "#da291c");
  assert.equal(normalizeColour("nope"), null);
});

test("tunnels, negative layers, and negative levels are underground; bridges are not", () => {
  assert.equal(isUnderground({ tunnel: "yes" }), true);
  assert.equal(isUnderground({ tunnel: "building_passage" }), true);
  assert.equal(isUnderground({ tunnel: "no" }), false);
  assert.equal(isUnderground({ "layer:osm": "-3" }), true);
  assert.equal(isUnderground({ level: "-1" }), true);
  assert.equal(isUnderground({ "layer:osm": "-1", bridge: "yes" }), false);
  assert.equal(isUnderground({ "layer:osm": "1", bridge: "yes" }), false);
  assert.equal(isUnderground({ railway: "subway" }), false);
});

test("stations are nodes; platforms are ways; highway=platform is not a road", () => {
  const ways = waysFromOverpass({
    elements: [
      { type: "node", id: 100, lat: 42.3564, lon: -71.0624, tags: { railway: "station", station: "subway", name: "Park Street", wheelchair: "yes", colour: "#DA291C;#00843D" } },
      { type: "node", id: 101, lat: 42.3566, lon: -71.0626, tags: { railway: "subway_entrance", wheelchair: "no" } },
      { type: "node", id: 102, lat: 42.3, lon: -71.1, tags: { amenity: "bench" } },
      { type: "way", id: 200, tags: { railway: "platform", public_transport: "platform", highway: "platform", name: "Platform 1" }, geometry: line([-71.06, 42.35], [-71.0605, 42.3502]) },
      { type: "way", id: 201, tags: { highway: "platform" }, geometry: line([-71.06, 42.35], [-71.0601, 42.3501]) },
      { type: "way", id: 202, tags: { railway: "platform", building: "roof" }, geometry: [
        { lat: 42.35, lon: -71.06 },
        { lat: 42.3501, lon: -71.06 },
        { lat: 42.3501, lon: -71.0599 },
        { lat: 42.35, lon: -71.06 },
      ] },
    ],
  });
  assert.deepEqual(
    ways.map((w) => [w.id, w.kind]),
    [
      [100, "station"],
      [101, "station"],
      [200, "platform"],
      [202, "building"],
    ],
  );
  assert.deepEqual(ways[0]?.points, [[-71.0624, 42.3564]]);
  assert.equal(ways[0]?.tags?.wheelchair, "yes");

  const geo = neighborhoodGeoJson({ place: { label: "Boston", lng: -71.06, lat: 42.355 }, note: "", ways }) as {
    features: { geometry: { type: string }; properties: Record<string, unknown> }[];
  };
  assert.deepEqual(
    geo.features.map((f) => [f.properties.layer, f.geometry.type]),
    [
      ["station", "Point"],
      ["station", "Point"],
      ["rail_platform", "LineString"],
      ["building", "Polygon"],
    ],
  );
  assert.equal(geo.features[0]?.properties.station, "subway");
});

test("the scene network carries tunnels, bridges, minor track, and station colour chips", () => {
  const project = (lon: number, lat: number): Pt => [(lon + 71) * 1000, (42 - lat) * 1000];
  const net = parseRail(
    [
      { type: "Feature", geometry: { type: "LineString", coordinates: [[-71.0, 42.0], [-71.0, 41.99]] }, properties: { layer: "rail", osmId: 1, railway: "subway", colour: "#DA291C", tunnel: "yes" } },
      { type: "Feature", geometry: { type: "LineString", coordinates: [[-70.99, 42.0], [-70.99, 41.99]] }, properties: { layer: "rail", osmId: 2, railway: "rail", bridge: "yes", "layer:osm": "1" } },
      { type: "Feature", geometry: { type: "LineString", coordinates: [[-70.98, 42.0], [-70.98, 41.99]] }, properties: { layer: "rail", osmId: 3, railway: "rail", service: "siding", colour: "#80276C" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [-71.0005, 41.995] }, properties: { layer: "station", osmId: 4, name: "Downtown", railway: "station", wheelchair: "yes" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [-71.0005, 41.996] }, properties: { layer: "station", osmId: 5, railway: "subway_entrance" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-70.99, 42.0], [-70.99, 41.999], [-70.989, 41.999], [-70.99, 42.0]]] }, properties: { layer: "rail_platform", osmId: 6 } },
      { type: "Feature", geometry: { type: "LineString", coordinates: [[-71, 42], [-71, 41.9]] }, properties: { layer: "road" } },
    ],
    project,
  );
  assert.equal(net.lines.length, 3);
  assert.deepEqual(
    net.lines.map((l) => [l.underground, l.bridge, l.minor, l.colour]),
    [
      [true, false, false, "#da291c"],
      [false, true, false, null],
      [false, false, true, "#80276c"],
    ],
  );
  const downtown = net.stations.find((s) => s.name === "Downtown")!;
  // The red tunnel passes 0.5 units away; the siding does not lend its colour.
  assert.deepEqual(downtown.colours, ["#da291c"]);
  assert.equal(net.stations.find((s) => s.id === "5")?.entrance, true);
  assert.equal(net.platforms[0]?.area, true);
  assert.equal(net.platforms[0]?.points.length, 3);
});

test("a point snaps to the nearest polyline of its colour", () => {
  const red = { points: [[0, 0], [10, 0]] as Pt[], colour: "#da291c" };
  const orange = { points: [[0, 2], [10, 2]] as Pt[], colour: "#ed8b00" };
  const s = nearestOnPolyline(4, 1.5, red.points);
  assert.equal(s.along, 4);
  assert.equal(s.distance, 1.5);
  const hit = snapToLines(4, 1.5, [red, orange], "#DA291C", 5);
  assert.equal(hit?.index, 0);
  assert.equal(snapToLines(4, 1.5, [red, orange], null, 5)?.index, 1);
  assert.equal(snapToLines(4, 30, [red, orange], "#da291c", 5), null);
  assert.equal(polylineLength([[0, 0], [3, 4], [3, 10]]), 11);
  assert.deepEqual(pointAlong([[0, 0], [3, 4], [3, 10]], 7), { x: 3, z: 6, dx: 0, dz: 1 });
  const left = offsetPolyline([[0, 0], [10, 0]], 1);
  assert.deepEqual(left.map(([x, z]) => [x, Math.round(z * 100) / 100]), [[0, 1], [10, 1]]);
  assert.equal(dashLine([[0, 0], [10, 0]], 2, 1).length, 4);
});

test("the loader asks Overpass for track, platforms, stations, and route colours", async () => {
  const loader = await readFile("src/data/overpass.ts", "utf8");
  assert.match(loader, /way\["railway"~"\^\(rail\|subway\|light_rail\|tram\|monorail\|narrow_gauge\|funicular\)\$"\]/);
  assert.match(loader, /node\["railway"~"\^\(station\|halt\|tram_stop\|subway_entrance\)\$"\]/);
  assert.match(loader, /make railref way=w\.u\(id\(\)\),colour=rr\.set\(t\["colour"\]\)/);
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(city, /<RailLayer\s+network=\{cityModel\.parsed\.rail\}/);
  assert.match(city, /if \(!track\.underground\) occupancy\.markLine\(track\.points, RAIL_CLEARANCE\)/);
});
