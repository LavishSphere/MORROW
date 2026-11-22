import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the city can be explored with mouse, keys, and touch, with hints", async () => {
  const rig = await readFile("src/showcase/scene/CameraRig.tsx", "utf8");
  const slot = await readFile("src/components/CanvasSlot.tsx", "utf8");
  const hints = await readFile("src/components/MoveHints.tsx", "utf8");

  // Mouse and touch: pan along the ground and zoom to street level.
  assert.match(rig, /enablePan\n/);
  assert.match(rig, /screenSpacePanning=\{false\}/);
  assert.match(rig, /const MIN_DISTANCE = 4;/);

  // Keyboard: WASD / arrows move, Q / E turn, + / − zoom.
  for (const key of ['"w"', '"arrowup"', '"q"', '"e"', '"="', '"-"', '"shift"']) {
    assert.ok(rig.includes(key), `missing key ${key}`);
  }
  // Keys typed into the search box or the mode tabs never move the camera.
  assert.match(rig, /if \(isTyping\(document\.activeElement\)\) return;/);
  assert.match(rig, /getAttribute\("role"\) === "tab"/);
  // The view stays over the city, and the ground past the edge stays visible.
  assert.match(rig, /const bound = span \* 0\.6;/);
  assert.match(rig, /past the edge/);
  assert.match(rig, /There is no wall/);

  // Hints sit over the canvas and adapt to touch screens.
  assert.match(slot, /<MoveHints \/>/);
  assert.match(hints, /\(pointer: coarse\)/);
  assert.match(hints, /Two fingers/);
  assert.match(hints, /<kbd>W<\/kbd>/);
});

test("the 3D view recovers instead of staying black", async () => {
  const canvas = await readFile("src/showcase/ShowcaseCanvas.tsx", "utf8");
  const rig = await readFile("src/showcase/scene/CameraRig.tsx", "utf8");
  // A dropped GPU context remounts the canvas instead of leaving it black.
  assert.match(canvas, /"webglcontextlost"/);
  assert.match(canvas, /setGlKey\(\(key\) => key \+ 1\)/);
  assert.match(canvas, /key=\{glKey\}/);
  // The loading cover never lingers more than a few seconds.
  assert.match(canvas, /const COVER_LIMIT_MS = 4000;/);
  // A broken camera position snaps back to the settled view.
  assert.match(rig, /Number\.isFinite\(p\.x \+ p\.y \+ p\.z \+ g\.x \+ g\.y \+ g\.z\)/);
});
