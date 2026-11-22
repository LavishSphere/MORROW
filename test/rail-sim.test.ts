import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Pt } from "../src/data/rail.ts";
import {
  consistFront,
  DWELL_S,
  MAX_SIM_CARS,
  MAX_SIM_TRAINS,
  planSimulation,
  segmentAt,
  simPosition,
  stitchRoutes,
  tripSeconds,
  withStops,
} from "../src/data/railRoutes.ts";
import { CAR_GAP, CAR_LENGTH, type TrackLine } from "../src/data/trains.ts";

const track = (points: [number, number][], colour: string | null, extra: Partial<TrackLine> = {}): TrackLine => ({
  points: points as Pt[],
  colour,
  railway: "subway",
  underground: false,
  bridge: false,
  ...extra,
});

test("track ways of one colour stitch into a continuous route", () => {
  const routes = stitchRoutes([
    track([[0, 0], [10, 0]], "#da291c"),
    track([[20, 0], [10, 0]], "#da291c", { underground: true }), // drawn backwards
    track([[20, 0], [30, 0]], "#da291c"),
    // A branch at the far end that doubles back is not a continuation.
    track([[30, 0], [25, 1]], "#da291c"),
    track([[0, 0], [0, 30]], "#ed8b00"),
  ]);
  const red = routes.filter((r) => r.colour === "#da291c");
  const longest = red.sort((a, b) => b.length - a.length)[0]!;
  assert.equal(longest.length, 30);
  assert.deepEqual(longest.points[0], [0, 0]);
  assert.deepEqual(longest.points[longest.points.length - 1], [30, 0]);
  assert.equal(longest.segments.length, 3);
  // The middle piece is the underground way.
  assert.equal(segmentAt(longest, 15)?.line, 1);
  const orange = routes.find((r) => r.colour === "#ed8b00")!;
  assert.equal(orange.length, 30);
  // Stubs shorter than a train are dropped.
  assert.equal(routes.some((r) => r.length < 8), false);
});

test("at a junction the straightest continuation wins", () => {
  const [route] = stitchRoutes([
    track([[0, 0], [10, 0]], "#00843d"),
    track([[10, 0], [14, 9]], "#00843d"),
    track([[10, 0], [20, 0.5]], "#00843d"),
  ]).sort((a, b) => b.length - a.length);
  assert.deepEqual(route!.points[route!.points.length - 1], [20, 0.5]);
});

test("simulated trains run out and back, pausing at stations, and repeat exactly", () => {
  const [base] = stitchRoutes([track([[0, 0], [60, 0]], "#da291c")]);
  const [route] = withStops([base!], [
    { x: 30, z: 2 },
    { x: 30, z: 1, entrance: true },
    { x: 90, z: 0 },
  ]);
  assert.deepEqual(route!.stops, [30]);
  const train = { route: 0, offset: 0, cars: 3 };
  // Subway runs at 3 units/s; half a dwell at the start.
  assert.deepEqual(simPosition(route!, train, 0), { along: 0, dir: 1 });
  assert.equal(simPosition(route!, train, DWELL_S / 2 + 5).along, 15);
  // Arrives at the stop after 10 s of running, then waits there.
  const arrive = DWELL_S / 2 + 10;
  assert.equal(simPosition(route!, train, arrive + 1).along, 30);
  assert.equal(simPosition(route!, train, arrive + DWELL_S - 0.5).along, 30);
  assert.ok(simPosition(route!, train, arrive + DWELL_S + 1).along > 30);
  // The second half of the cycle comes back.
  const trip = tripSeconds(route!);
  const back = simPosition(route!, train, trip + DWELL_S / 2 + 5);
  assert.deepEqual(back, { along: 45, dir: -1 });
  assert.deepEqual(simPosition(route!, train, 123.4), simPosition(route!, train, 123.4 + 2 * trip));
});

test("headways set how many trains run, within the overall caps", () => {
  const [subway] = stitchRoutes([track([[0, 0], [300, 0]], "#da291c")]);
  const [commuter] = stitchRoutes([track([[0, 0], [300, 0]], "#80276c", { railway: "rail" })]);
  const subwayTrains = planSimulation([subway!]);
  const commuterTrains = planSimulation([commuter!]);
  assert.ok(subwayTrains.length > commuterTrains.length);
  assert.ok(commuterTrains.length >= 1);
  // Seeded: the same plan every time, evenly spread through the cycle.
  assert.deepEqual(planSimulation([subway!]), subwayTrains);
  const many = stitchRoutes(
    Array.from({ length: 60 }, (_, i) => track([[0, i * 10], [400, i * 10]], `#${(100000 + i).toString(16).padStart(6, "0")}`)),
  );
  const plan = planSimulation(many);
  assert.ok(plan.length <= MAX_SIM_TRAINS);
  assert.ok(plan.reduce((sum, t) => sum + t.cars, 0) <= MAX_SIM_CARS);
});

test("a simulated consist stays on its route at both ends", () => {
  const train = 3 * (CAR_LENGTH + CAR_GAP);
  assert.equal(consistFront(0, 1, 60, 3), train);
  assert.equal(consistFront(60, 1, 60, 3), 60);
  assert.equal(consistFront(60, -1, 60, 3), 60 - train);
  assert.equal(consistFront(0, -1, 60, 3), 0);
});

test("the rail layer runs simulated trains, and live ones replace them", async () => {
  const layer = await readFile("src/showcase/scene/RailLayer.tsx", "utf8");
  const trains = await readFile("src/showcase/scene/Trains.tsx", "utf8");
  assert.match(layer, /planSimulation\(routes\)/);
  assert.match(trains, /Live vehicles replace simulated trains on the lines they cover/);
  assert.match(trains, /const t = reducedMotion \? 0 : clock\.elapsedTime/);
});
