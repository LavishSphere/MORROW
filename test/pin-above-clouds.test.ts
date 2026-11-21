import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the barrier pin paints above the clouds", async () => {
  const sky = await readFile("src/index.css", "utf8");
  const town = await readFile("src/satellite/town/town.css", "utf8");
  const skyZ = Number(sky.match(/\.dream-sky \{[^}]*z-index:\s*(\d+)/s)?.[1]);
  const pinZ = Number(town.match(/\.satellite-pin \{[^}]*z-index:\s*(\d+)/s)?.[1]);
  const leaderZ = Number(
    town.match(/\.satellite-town__leader \{[^}]*z-index:\s*(\d+)/s)?.[1],
  );
  assert.ok(Number.isFinite(skyZ) && Number.isFinite(pinZ) && Number.isFinite(leaderZ));
  assert.ok(pinZ > skyZ);
  assert.ok(leaderZ > skyZ);
});
