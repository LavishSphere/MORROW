import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("clouds sit under the satellite caption and modeled meters", async () => {
  const town = await readFile("src/satellite/town/SatelliteTown.tsx", "utf8");
  const app = await readFile("src/App.tsx", "utf8");
  const sky = town.indexOf('className="dream-sky"');
  const caption = town.indexOf("satellite-town__caption");
  const meters = town.indexOf("satellite-town__meters");
  assert.ok(sky > 0);
  assert.ok(caption > sky);
  assert.ok(meters > sky);
  assert.equal(app.includes("dream-sky"), false);
});
