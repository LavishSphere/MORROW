import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { MotionTracker, REBUILD_QUIET_MS, SETTLE_MS, whenCameraRests } from "../src/showcase/motion.ts";
import { FramePace, FrameStrain, pickDpr } from "../src/showcase/viewBudget.ts";

const still: number[] = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));

test("the camera counts as moving while it changes, and briefly after", () => {
  const motion = new MotionTracker();
  assert.equal(motion.update(still, 0), true);
  assert.equal(motion.update(still, 16), false);
  assert.equal(motion.busy(16), true);
  assert.equal(motion.busy(SETTLE_MS + 1), false);
  const moved = still.slice();
  moved[12] = 4;
  assert.equal(motion.update(moved, 1000), true);
  assert.equal(motion.busy(1000), true);
  assert.equal(motion.update(moved, 1016), false);
  assert.equal(motion.idleFor(1100), 100);
  // A scroll counts before the camera reacts.
  motion.input(2000);
  assert.equal(motion.busy(2100), true);
  assert.equal(motion.idleFor(2500), 500);
});

test("resolution drops only on a GPU that cannot keep up", () => {
  const pace = new FramePace(4, 20);
  for (const ms of [16, 17, 16]) assert.equal(pace.add(ms), false);
  assert.equal(pace.add(16), false);
  // A stall after a tab switch is ignored.
  assert.equal(pace.add(900), false);
  for (const ms of [30, 33, 31, 32]) pace.add(ms);
  assert.equal(pace.slow, true);
  // Slow stays slow.
  for (const ms of [8, 8, 8, 8]) pace.add(ms);
  assert.equal(pace.slow, true);
  const base = { sharp: 1.5, busy: true, slowMoving: false, slowResting: false };
  assert.equal(pickDpr(base), 1.5);
  assert.equal(pickDpr({ ...base, slowMoving: true }), 1);
  assert.equal(pickDpr({ ...base, busy: false, slowMoving: true }), 1.5);
  assert.equal(pickDpr({ ...base, busy: false, slowResting: true }), 1);
});

test("the canvas caps its resolution and spends less while the camera moves", async () => {
  const canvas = await readFile("src/showcase/ShowcaseCanvas.tsx", "utf8");
  const town = await readFile("src/showcase/scene/TownScene.tsx", "utf8");
  const budget = await readFile("src/showcase/scene/ViewBudget.tsx", "utf8");
  assert.match(canvas, /dpr=\{\[1, DPR_MAX\]\}/);
  assert.match(budget, /export const DPR_MAX = 1\.5;/);
  assert.match(budget, /const dpr = pickDpr\(/);
  assert.match(town, /<ViewBudget \/>/);
});

test("more map tiles wait while frames are slow, and resume once they are fast again", () => {
  const strain = new FrameStrain(3, 26, 19);
  for (const ms of [17, 17, 17]) strain.add(ms);
  assert.equal(strain.strained, false);
  for (const ms of [33, 33, 33]) strain.add(ms);
  assert.equal(strain.strained, true);
  // In between: still strained until clearly fast.
  for (const ms of [22, 22, 22]) strain.add(ms);
  assert.equal(strain.strained, true);
  for (const ms of [16, 16, 16]) strain.add(ms);
  assert.equal(strain.strained, false);
});

test("a rebuild waits until the camera has rested", async () => {
  const motion = new MotionTracker();
  let ran = 0;
  motion.input(Date.now());
  const cancel = whenCameraRests(() => (ran += 1), 40, 10, motion);
  assert.equal(ran, 0);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(ran, 1);
  cancel();
  // Already resting: runs at once.
  whenCameraRests(() => (ran += 1), 0, 10, motion);
  assert.equal(ran, 2);
  assert.ok(REBUILD_QUIET_MS >= 2000);
});

test("Overture footprints decode in a worker, with the page as a fallback", async () => {
  const client = await readFile("src/data/overtureClient.ts", "utf8");
  const worker = await readFile("src/data/overtureWorker.ts", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(client, /new Worker\(new URL\("\.\/overtureWorker\.ts", import\.meta\.url\), \{ type: "module" \}\)/);
  assert.match(client, /footprints \?\? readHere\(box\)/);
  assert.match(worker, /fetchOvertureBuildings\(box\)/);
  assert.match(city, /from "\.\.\/\.\.\/data\/overtureClient\.ts"/);
});
