import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildProgress,
  CLUSTER_FROM,
  clusterCell,
  clusterPins,
  dashes,
  ISSUE_COLOR,
  ISSUE_SHAPE,
  LABEL_ZOOM,
  labelIds,
  markerScale,
  pathLength,
  patchMesh,
  problemMesh,
  SIDEWALK_OFFSET,
  todayMesh,
  type PinInput,
} from "../src/showcase/issueVisuals.ts";

const street: [number, number][] = [
  [0, 0],
  [10, 0],
];

test("every kind has its own colour and its own pin shape", () => {
  assert.equal(new Set(Object.values(ISSUE_COLOR)).size, 4);
  assert.equal(new Set(Object.values(ISSUE_SHAPE)).size, 4);
});

test("pins keep their screen size across zooms, within limits", () => {
  assert.ok(markerScale(15) < markerScale(60));
  assert.ok(markerScale(60) < markerScale(100));
  assert.equal(markerScale(1), 0.8);
  assert.equal(markerScale(10_000), 4);
});

test("far out, nearby pins merge with a count; close in, every issue has its own", () => {
  assert.equal(clusterCell(CLUSTER_FROM - 1), 0);
  assert.ok(clusterCell(CLUSTER_FROM + 30) > 0);
  // Snapped, so tiny zoom changes do not regroup.
  assert.equal(clusterCell(100), clusterCell(101));

  const issues: PinInput[] = [
    { id: "unpaved_path-1", kind: "unpaved_path", x: 1, z: 1, fixed: false },
    { id: "stairs-2", kind: "stairs", x: 2, z: 2, fixed: false },
    { id: "no_sidewalk-3", kind: "no_sidewalk", x: 3, z: 3, fixed: true },
    { id: "unmarked_crossing-4", kind: "unmarked_crossing", x: 50, z: 50, fixed: false },
  ];
  assert.equal(clusterPins(issues, 0).length, 4);
  const pins = clusterPins(issues, 10);
  assert.equal(pins.length, 2);
  const group = pins.find((pin) => pin.ids.length === 3)!;
  // The most severe open issue leads the group; fixed ones are not counted as open.
  assert.equal(group.kind, "stairs");
  assert.equal(group.open, 2);
  assert.equal(group.fixed, false);
  assert.equal(group.x, 2);
  // Most severe first, every issue in exactly one pin.
  assert.equal(pins[0], group);
  assert.equal(pins.flatMap((pin) => pin.ids).length, issues.length);
  // A lone issue keeps its own id as key, so selection and labels still match.
  assert.equal(pins[1]!.key, "unmarked_crossing-4");
});

test("only the nearest few pins are labelled, and only when zoomed in", () => {
  const issues: PinInput[] = Array.from({ length: 12 }, (_, i) => ({
    id: `no_sidewalk-${i}`,
    kind: i === 7 ? "stairs" : "no_sidewalk",
    x: i,
    z: 0,
    fixed: false,
  }));
  assert.deepEqual(labelIds(issues, { x: 0, z: 0 }, LABEL_ZOOM + 1), []);
  const ids = labelIds(issues, { x: 0, z: 0 }, 20, 8);
  assert.equal(ids.length, 8);
  assert.equal(ids[0], "no_sidewalk-7");
  assert.ok(!ids.includes("no_sidewalk-11"));
});

test("the build-in eases to done, and is instant with reduced motion", () => {
  assert.equal(buildProgress(0, 1, true), 1);
  assert.equal(buildProgress(0, 1, false), 0);
  assert.ok(buildProgress(0.5, 1, false) > 0.5);
  assert.equal(buildProgress(2, 1, false), 1);
});

test("dashes cover about the drawn share of a path", () => {
  const pieces = dashes(street, 0.6, 0.4);
  const drawn = pieces.reduce((sum, piece) => sum + pathLength(piece), 0);
  assert.equal(pieces.length, 10);
  assert.ok(Math.abs(drawn - 6) < 1e-6);
});

/** Average z of a flat mesh's vertices. */
function meanZ(positions: number[]) {
  let sum = 0;
  for (let i = 2; i < positions.length; i += 3) sum += positions[i]!;
  return sum / (positions.length / 3);
}

test("a missing sidewalk is dashed exactly where the new sidewalk goes", () => {
  const left = { kind: "no_sidewalk" as const, path: street, sides: "left" as const };
  const warn = problemMesh(left);
  const fix = patchMesh(left);
  // The way runs east (+x) and scene z points south, so its left is north (-z).
  assert.ok(Math.abs(meanZ(warn.positions) + SIDEWALK_OFFSET) < 1e-6);
  assert.ok(Math.abs(meanZ(fix.surface.positions) + SIDEWALK_OFFSET) < 0.2);
  assert.ok(meanZ(problemMesh({ ...left, sides: "right" }).positions) > 0);
  // Both sides: twice the sidewalk.
  const both = patchMesh({ ...left, sides: "both" });
  assert.equal(both.surface.positions.length, fix.surface.positions.length * 2);
  assert.equal(warn.colors.length, warn.positions.length);
});

test("each fix is drawn from start to end, so it can build along the street", () => {
  for (const kind of ["stairs", "unmarked_crossing", "no_sidewalk", "unpaved_path"] as const) {
    const { surface, edges } = patchMesh({ kind, path: street, sides: "both" });
    assert.ok(surface.positions.length > 0, `${kind} has a surface`);
    assert.ok(edges.positions.length > 0, `${kind} has proposed trim`);
    assert.equal(surface.positions.length % 18, 0, "whole quads");
    const quadX = (i: number) => (surface.positions[i * 18]! + surface.positions[i * 18 + 3]!) / 2;
    const quads = surface.positions.length / 18;
    assert.ok(quadX(0) <= quadX(quads - 1), `${kind} starts at the path start`);
  }
});

test("no triangle faces down: flat ones face up, walls stand upright, so one-sided materials draw them", () => {
  const bent: [number, number][] = [
    [0, 0],
    [5, 3],
    [5, 9],
    [-2, 12],
  ];
  const meshes = (["stairs", "unmarked_crossing", "no_sidewalk", "unpaved_path"] as const).flatMap((kind) => {
    const issue = { kind, path: bent, sides: "both" as const };
    const { surface, edges } = patchMesh(issue);
    return [surface, edges, problemMesh(issue), todayMesh(issue)];
  });
  for (const { positions } of meshes) {
    for (let i = 0; i < positions.length; i += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9) as number[];
      const [ux, uy, uz, vx, vy, vz] = [bx! - ax!, by! - ay!, bz! - az!, cx! - ax!, cy! - ay!, cz! - az!];
      // (b - a) × (c - a)
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const up = n[1]!;
      // The ramp's walls, rails and posts are upright; every other face points up.
      if (Math.abs(up) <= 1e-9 * Math.hypot(n[0]!, n[2]!)) continue;
      assert.ok(up > 0, "triangle faces up");
    }
  }
});

test("the stairs ramp is solid: it rises to the end, its walls face out, and it stays cheap", () => {
  const short: [number, number][] = [
    [0, 0],
    [3, 0],
  ];
  const { surface, edges } = patchMesh({ kind: "stairs", path: short });
  const ys = surface.positions.filter((_, i) => i % 3 === 1);
  assert.ok(Math.max(...ys) > 0.3, "rails stand above the top of the ramp");
  let walls = 0;
  for (let i = 0; i < surface.positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = surface.positions.slice(i, i + 9) as number[];
    const [ux, uy, uz, vx, vy, vz] = [bx! - ax!, by! - ay!, bz! - az!, cx! - ax!, cy! - ay!, cz! - az!];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    if (Math.abs(n[1]!) > 1e-9 * Math.hypot(n[0]!, n[2]!)) continue;
    walls += 1;
    // A side wall faces away from the ramp's centre line (z = RAMP_OFFSET); posts face every way.
    const mz = (az! + bz! + cz!) / 3;
    if (Math.abs(n[0]!) < 1e-9 && Math.abs(mz - 0.46) > 0.19) assert.ok(Math.sign(n[2]!) === Math.sign(mz - 0.46), "wall faces out");
  }
  assert.ok(walls > 0, "the ramp has upright sides");
  assert.ok((surface.positions.length + edges.positions.length) / 9 < 200, "under 200 triangles");
});

test("a crossing fix adds tactile paving at both ends; stairs keep their treads beside the ramp", () => {
  const crossing = patchMesh({ kind: "unmarked_crossing", path: street });
  const yellow = [1, 210 / 255, 63 / 255];
  let tactile = 0;
  for (let i = 0; i < crossing.surface.colors.length; i += 3) {
    if (crossing.surface.colors.slice(i, i + 3).every((c, k) => Math.abs(c - yellow[k]!) < 1e-6)) tactile += 1;
  }
  assert.equal(tactile, 12, "two pads of six vertices");

  const stairs = { kind: "stairs" as const, path: street };
  assert.ok(todayMesh(stairs).positions.length > 0);
  assert.ok(meanZ(patchMesh(stairs).surface.positions) > 0.3, "the ramp sits beside the stairs");
});

test("issue pins are instanced, labelled, and calm with reduced motion", async () => {
  const layer = await readFile("src/showcase/scene/IssueLayer.tsx", "utf8");
  assert.match(layer, /<instancedMesh/);
  assert.match(layer, /clusterPins\(/);
  assert.match(layer, /setDrawRange/);
  assert.match(layer, /buildProgress\(clock\.elapsedTime - started\.current, BUILD_SECONDS, reducedMotion\)/);
  assert.match(layer, /if \(reducedMotion\) return;/);
  // A cluster click zooms in instead of opening one issue.
  assert.match(layer, /flyTo\(pin\.x, pin\.z/);
  // Pin layout is written to instance matrices in the frame loop, not React state.
  assert.match(layer, /setMatrixAt\(/);
});

test("Improve switches the selected street between today and the fix, and the map has a key", async () => {
  const store = await readFile("src/showcase/issueStore.ts", "utf8");
  const browser = await readFile("src/components/IssueBrowser.tsx", "utf8");
  const slot = await readFile("src/components/CanvasSlot.tsx", "utf8");
  assert.match(store, /export function setPeek/);
  assert.match(browser, /onClick=\{\(\) => setPeek\('before'\)\}/);
  assert.match(browser, />\s*With the fix\s*</);
  assert.match(slot, /<IssueLegend \/>/);
});
