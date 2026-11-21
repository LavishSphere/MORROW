import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TOWN_FRAME,
  fitTownZoom,
  lngLatToWorld,
} from "../src/satellite/camera/project.ts";

test("town zoom fits the Wellesley frame inside a laptop viewport", () => {
  const zoom = fitTownZoom(1280, 720);
  assert.ok(zoom > 12 && zoom < 17, `zoom ${zoom} is outside the town range`);
  const nw = lngLatToWorld(TOWN_FRAME.west, TOWN_FRAME.north, zoom);
  const se = lngLatToWorld(TOWN_FRAME.east, TOWN_FRAME.south, zoom);
  assert.ok(Math.abs(se.x - nw.x) <= 1280 - 72);
  assert.ok(Math.abs(se.y - nw.y) <= 720 - 72);
});

test("east of the town center projects further right", () => {
  const zoom = 16;
  const center = lngLatToWorld(TOWN_FRAME.center.lng, TOWN_FRAME.center.lat, zoom);
  const east = lngLatToWorld(TOWN_FRAME.east, TOWN_FRAME.center.lat, zoom);
  assert.ok(east.x > center.x);
});
