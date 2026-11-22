import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  deckHeight,
  joinRuns,
  planBridges,
  rampProfile,
  type BridgeRoad,
  type Pt,
} from "../src/showcase/scene/bridges.ts";

/** A straight east-west line from x0 to x1 with a point every unit. */
function line(x0: number, x1: number, z = 0): Pt[] {
  const points: Pt[] = [];
  const step = x1 > x0 ? 1 : -1;
  for (let x = x0; step > 0 ? x <= x1 : x >= x1; x += step) points.push([x, z]);
  return points;
}

function road(id: string, points: Pt[], extra: Partial<BridgeRoad> = {}): BridgeRoad {
  return { id, points, kind: "road", bridge: false, halfWidth: 0.6, ...extra };
}

test("a bridge ramp starts and ends on the ground and peaks in the middle", () => {
  const ys = rampProfile(line(0, 100), 5);
  assert.equal(ys[0], 0);
  assert.equal(ys[ys.length - 1], 0);
  assert.equal(ys[50], 5);
  assert.equal(Math.max(...ys), 5);
  // Smooth: never steps down on the way up.
  for (let i = 1; i <= 50; i += 1) assert.ok(ys[i]! >= ys[i - 1]!);
});

test("a deck on layer 2 stands higher than one on layer 1", () => {
  const one = deckHeight({ length: 20, layer: 1, crossesRoad: true });
  const two = deckHeight({ length: 20, layer: 2, crossesRoad: true });
  assert.ok(two > one);
  // A deck over a street clears traffic: at least 1.5 scene units.
  assert.ok(one >= 1.5);
  // A culvert over a creek stays low.
  assert.ok(deckHeight({ length: 2, layer: 1, wet: true }) < 1);
  // A ship channel span stands high.
  assert.ok(deckHeight({ length: 300, structure: "suspension" }) > 10);
});

test("bridge ways that share an endpoint join into one run", () => {
  const runs = joinRuns([
    road("a", line(0, 40), { bridge: true, name: "Harvard Bridge" }),
    road("b", line(80, 40), { bridge: true, name: "Harvard Bridge" }),
  ]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.pieces.length, 2);
  assert.equal(runs[0]!.points.length, 81);
});

test("a suspension bridge gets two towers and its cables", () => {
  const plan = planBridges([
    road("1", line(0, 300), { bridge: true, layer: 1, structure: "suspension", name: "Some Strait Bridge" }),
  ]);
  assert.equal(plan.towers.length, 2);
  assert.ok(plan.cables.length > 2);
  const [a, b] = plan.towers;
  assert.ok(a!.top > a!.deck && b!.top > b!.deck);
  // Towers near 17 % and 83 % of the span.
  assert.ok(Math.abs(a!.x - 51) < 2 && Math.abs(b!.x - 249) < 2);
  // No piers under the suspended main span.
  assert.ok(plan.piers.every((pier) => pier.x < a!.x || pier.x > b!.x));
  assert.deepEqual(plan.extent && [plan.extent.minX, plan.extent.maxX], [0, 300]);
});

test("the Tobin Bridge is mapped as suspension but drawn as a cantilever, without towers", () => {
  const plan = planBridges(
    [road("2", line(0, 300), { bridge: true, layer: 1, structure: "suspension", name: "Tobin Bridge" })],
    [
      {
        id: "631109724",
        structure: "suspension",
        ring: [
          [-2, -3],
          [302, -3],
          [302, 3],
          [-2, 3],
        ],
      },
    ],
  );
  assert.equal(plan.towers.length, 0);
  assert.equal(plan.cables.length, 0);
  assert.ok(Math.max(...plan.decks.get("2")!.ys) > 5);
});

test("the street that leads onto a bridge ramps up to the deck", () => {
  const plan = planBridges([
    road("approach", line(-60, 0)),
    road("deck", line(0, 30), { bridge: true, layer: 1, name: "Overpass" }),
    road("away", line(30, 90)),
    road("below", [
      [15, -20],
      [15, 20],
    ]),
  ], [], { crossesRoad: () => true });
  const deck = plan.decks.get("deck")!;
  const approach = plan.decks.get("approach")!;
  assert.equal(deck.bridge, true);
  assert.equal(approach.bridge, false);
  // The deck stays level; the approach climbs from the ground to meet it.
  assert.ok(Math.abs(deck.ys[0]! - deck.ys[15]!) < 1e-9);
  assert.equal(approach.ys[0], 0);
  assert.ok(Math.abs(approach.ys[approach.ys.length - 1]! - deck.ys[0]!) < 1e-9);
  // The street underneath stays on the ground.
  assert.equal(plan.decks.has("below"), false);
});

test("the glass city lifts bridges and keeps the big ones clear of the fog", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const loader = (await readFile("src/data/overpass.ts", "utf8")) + (await readFile("shared/osmQueries.ts", "utf8"));
  assert.match(city, /planBridges\(/);
  assert.match(city, /function strip3\(/);
  assert.match(city, /fog: !far/);
  assert.match(city, /item\.y \?\? 0/);
  assert.match(loader, /fetchLandmarkBridges\(place\.lng, place\.lat\)/);
  assert.match(loader, /relation\["man_made"="bridge"\]/);
});
