import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { waysFromOverpass } from "../src/data/overpass.ts";
import {
  advance,
  buildTrafficLanes,
  carSpeed,
  FootprintGrid,
  isIndoor,
  newAgent,
  onewayOf,
  spawn,
  type Lane,
  type TrafficWay,
} from "../src/showcase/scene/trafficLanes.ts";

const street = (over: Partial<TrafficWay> = {}): TrafficWay => ({
  layer: "road",
  highway: "residential",
  halfWidth: 0.4,
  points: [
    [0, 0],
    [10, 0],
  ],
  oneway: 0,
  ...over,
});

/** Distance from (x, z) to the lane's polyline. */
function offLane(lane: Lane, x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < lane.xs.length - 1; i += 1) {
    const ax = lane.xs[i]!;
    const az = lane.zs[i]!;
    const dx = lane.xs[i + 1]! - ax;
    const dz = lane.zs[i + 1]! - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

test("OSM oneway and roundabouts read as a direction", () => {
  assert.equal(onewayOf({ oneway: "yes" }), 1);
  assert.equal(onewayOf({ oneway: "true" }), 1);
  assert.equal(onewayOf({ oneway: "1" }), 1);
  assert.equal(onewayOf({ oneway: "-1" }), -1);
  assert.equal(onewayOf({ junction: "roundabout" }), 1);
  assert.equal(onewayOf({ oneway: "no", junction: "roundabout" }), 0);
  assert.equal(onewayOf({}), 0);
  assert.equal(onewayOf(null), 0);
});

test("Overpass keeps oneway, junction, and the level tags on the road", () => {
  const [way] = waysFromOverpass({
    elements: [
      {
        type: "way",
        id: 1,
        // Tunnels are dropped before this point (they'd be drawn through buildings), so an upper-level way stands in.
        tags: { highway: "footway", oneway: "yes", junction: "roundabout", layer: "1", level: "1" },
        geometry: [
          { lat: 37.79, lon: -122.4 },
          { lat: 37.791, lon: -122.4 },
        ],
      },
    ],
  });
  assert.equal(way?.tags?.oneway, "yes");
  assert.equal(way?.tags?.junction, "roundabout");
  assert.equal(way?.tags?.level, "1");
  assert.equal(way?.tags?.["layer:osm"], "1");
  assert.equal(way?.tags?.layer, undefined);
});

test("corridors, indoor, tunnels, covered ways, below ground, and other levels are indoors", () => {
  assert.equal(isIndoor({ highway: "corridor" }), true);
  assert.equal(isIndoor({ indoor: "yes" }), true);
  assert.equal(isIndoor({ tunnel: "building_passage" }), true);
  assert.equal(isIndoor({ tunnel: "no" }), false);
  assert.equal(isIndoor({ covered: "yes" }), true);
  assert.equal(isIndoor({ "layer:osm": "-1" }), true);
  assert.equal(isIndoor({ "layer:osm": "1" }), false);
  assert.equal(isIndoor({ level: "1" }), true);
  assert.equal(isIndoor({ level: "0" }), false);
  assert.equal(isIndoor({ highway: "footway" }), false);
});

test("a two-way street has a lane each way, on the right of travel", () => {
  const { cars } = buildTrafficLanes([street()]);
  assert.equal(cars.length, 2);
  const [east, west] = cars as [Lane, Lane];
  // Heading east (+x) in an x-east, z-south frame, the right is +z (south).
  assert.ok(east.xs[0]! < east.xs[east.xs.length - 1]!);
  assert.ok(Math.abs(east.zs[0]! - 0.2) < 1e-9);
  assert.ok(west.xs[0]! > west.xs[west.xs.length - 1]!);
  assert.ok(Math.abs(west.zs[0]! + 0.2) < 1e-9);
  assert.equal(east.reverse, 1);
  assert.equal(west.reverse, 0);
  // A dead end turns around.
  assert.deepEqual(east.next, [1]);
  assert.equal(east.speed, carSpeed("residential"));
  assert.ok(carSpeed("primary") > carSpeed("tertiary"));
  assert.ok(carSpeed("tertiary") > carSpeed("residential"));
});

test("a one-way street has one lane in the drawn direction, and -1 reverses it", () => {
  const forward = buildTrafficLanes([street({ oneway: 1 })]).cars;
  assert.equal(forward.length, 1);
  assert.ok(forward[0]!.xs[0]! < forward[0]!.xs[1]!);
  const backward = buildTrafficLanes([street({ oneway: -1 })]).cars;
  assert.equal(backward.length, 1);
  assert.ok(backward[0]!.xs[0]! > backward[0]!.xs[1]!);
});

test("service roads, indoor ways, and footpaths get no moving cars", () => {
  const lanes = buildTrafficLanes([
    street({ highway: "service" }),
    street({ indoor: true }),
    street({ layer: "footway", highway: "footway" }),
  ]);
  assert.equal(lanes.cars.length, 0);
  assert.equal(lanes.walks.length, 1);
});

test("streets that share an end are joined, and a car turns onto the next one", () => {
  const a = street({ oneway: 1 });
  const b = street({
    oneway: 1,
    points: [
      [10, 0],
      [10, 10],
    ],
  });
  const { cars } = buildTrafficLanes([a, b]);
  assert.deepEqual(cars[0]!.next, [1]);
  const car = newAgent();
  spawn(car, cars, 0, 9.5);
  advance(car, cars, 1);
  assert.equal(car.lane, 1);
  assert.ok(offLane(cars[1]!, car.x, car.z) < 1e-6);
  // Heading south (+z) after the turn: local +x points along travel.
  assert.ok(Math.abs(Math.cos(car.yaw)) < 1e-6 && Math.sin(car.yaw) < 0);
});

test("a street is cut where another street meets it mid-way, so cars can turn there", () => {
  const main = street({
    oneway: 1,
    points: [
      [0, 0],
      [10, 0],
      [20, 0],
    ],
  });
  const side = street({
    oneway: 1,
    points: [
      [10, 0],
      [10, 10],
    ],
  });
  const { cars } = buildTrafficLanes([main, side]);
  assert.equal(cars.length, 3);
  const first = cars.find((lane) => lane.xs[0] === 0)!;
  assert.equal(first.length, 10);
  assert.equal(first.next.length, 2);
});

test("advance stays on the polyline and starts over at the end of a lone lane", () => {
  const bent = street({
    oneway: 1,
    points: [
      [0, 0],
      [4, 0],
      [4, 3],
      [8, 6],
    ],
  });
  const { cars } = buildTrafficLanes([bent]);
  const lane = cars[0]!;
  assert.ok(Math.abs(lane.length - 12) < 1e-9);
  const car = newAgent();
  spawn(car, cars, 0, 0);
  for (let i = 0; i < 40; i += 1) {
    advance(car, cars, 0.1);
    assert.ok(offLane(lane, car.x, car.z) < 1e-6, "on the lane");
    assert.ok(car.s >= 0 && car.s <= lane.length);
  }
  // 40 × 0.1 s × 1.6 units/s = 6.4 units along.
  assert.ok(Math.abs(car.s - 6.4) < 1e-6);
  advance(car, cars, 5);
  // Past the 12-unit end: back near the start of the same lane.
  assert.equal(car.lane, 0);
  assert.ok(Math.abs(car.s - (6.4 + 8 - 12)) < 1e-6);
  assert.ok(offLane(lane, car.x, car.z) < 1e-6);
});

test("walkers turn back at the end of a path and skip the parts inside buildings", () => {
  const path = street({
    layer: "footway",
    highway: "footway",
    points: [
      [0, 0],
      [20, 0],
    ],
  });
  const house: [number, number][] = [
    [8, -1],
    [12, -1],
    [12, 1],
    [8, 1],
  ];
  const grid = new FootprintGrid([house]);
  assert.equal(grid.inside(10, 0), true);
  assert.equal(grid.inside(14, 0), false);
  const { walks } = buildTrafficLanes([path], grid);
  assert.equal(walks.length, 2);
  for (const lane of walks) {
    for (let i = 0; i < lane.xs.length; i += 1) assert.equal(grid.inside(lane.xs[i]!, lane.zs[i]!), false);
  }
  const walker = newAgent();
  spawn(walker, walks, 0, 0.1, () => 0.9);
  for (let i = 0; i < 400; i += 1) {
    advance(walker, walks, 0.1);
    assert.equal(grid.inside(walker.x, walker.z), false);
    assert.ok(walker.s >= 0 && walker.s <= walks[0]!.length);
  }
  assert.ok(walker.speed >= 0.18 && walker.speed <= 0.25);
});

test("traffic runs only when zoomed in, motion is welcome, and the tab is visible", async () => {
  const traffic = await readFile("src/showcase/scene/Traffic.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(traffic, /reducedMotion/);
  assert.match(traffic, /document\.hidden/);
  assert.match(traffic, /camera\.position\.distanceTo\(target\) < ZOOMED_IN/);
  assert.match(traffic, /frustumCulled = false/);
  assert.match(traffic, /raycast = \(\) => null/);
  assert.match(city, /<Traffic lanes=\{built\.traffic\}[^\n]*reducedMotion=\{reducedMotion\} \/>/);
  assert.match(city, /footprints\.inside\(/);
});
