import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("motion is on by default and the Reduced motion toggle is remembered", async () => {
  const app = await readFile("src/App.tsx", "utf8");
  // The OS setting no longer turns motion off on its own.
  assert.equal(app.includes("prefers-reduced-motion"), false);
  assert.match(app, /localStorage\.getItem\(REDUCED_MOTION_KEY\) === '1'/);
  assert.match(app, /localStorage\.setItem\(REDUCED_MOTION_KEY, on \? '1' : '0'\)/);
  assert.match(app, /onReducedMotionChange=\{setReducedMotion\}/);
});
