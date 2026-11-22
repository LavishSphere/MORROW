import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  POTHOLES,
  draftForPothole,
  getPotholeFix,
  patchPothole,
  resetPotholeFix,
  scatterPotholes,
  selectPothole,
} from "../src/city/potholeFix.ts";
import {
  getStreetImprovementState,
  resetStreetImprovements,
  STREET_IMPROVEMENTS,
  toggleStreetImprovement,
} from "../src/city/streetImprovements.ts";
import type { DraftProposal } from "../src/types.ts";

test("a clicked pothole can be patched without inventing a route", () => {
  resetPotholeFix();
  selectPothole("boulevard-pothole-2");
  assert.equal(getPotholeFix().selectedId, "boulevard-pothole-2");
  assert.deepEqual(getPotholeFix().patchedIds, []);
  patchPothole("boulevard-pothole-2");
  assert.deepEqual(getPotholeFix().patchedIds, ["boulevard-pothole-2"]);
  selectPothole("not-a-hole");
  assert.equal(getPotholeFix().selectedId, "boulevard-pothole-2");
  resetPotholeFix();
});

test("any city's roads get illustrative potholes", () => {
  const roads = [
    { id: "main", name: "Main Street", points: [[0, 0], [12, 0]] as const },
    { id: "oak", name: "Oak Avenue", points: [[0, 5], [14, 5]] as const },
  ];
  const holes = scatterPotholes(roads);
  assert.ok(holes.length >= 2);
  const labels = holes.map((hole) => hole.issue.label).join(" ");
  assert.match(labels, /Main Street/);
  assert.match(labels, /Oak Avenue/);
  const again = scatterPotholes(roads);
  assert.deepEqual(
    again.map((hole) => [hole.x, hole.z]),
    holes.map((hole) => [hole.x, hole.z]),
  );
  assert.equal(scatterPotholes([]).length, 0);
  assert.equal(scatterPotholes([{ id: "stub", points: [[0, 0]] }]).length, 0);
});

test("a generated draft names the clicked pothole and keeps the route text", () => {
  const base: DraftProposal = {
    headline: "Wellesley route",
    plainLanguageSummary: "Modeled trip stays here.",
    requestForReview: "Please review the route.",
    meetingTalkingPoints: ["Route point."],
    limitations: "Modeled impact only.",
  };
  const patched = draftForPothole(base, POTHOLES[0] ?? null, true);
  assert.match(patched.headline, /Boulevard pothole, west of the bend/);
  assert.match(patched.plainLanguageSummary, /Patched in this demo/);
  assert.match(patched.plainLanguageSummary, /does not change the modeled route/);
  assert.match(patched.plainLanguageSummary, /Modeled trip stays here/);
  assert.equal(draftForPothole(base, null, false).headline, "Wellesley route");
});

test("the popup and mode pages keep the patch flow, and the city draws no disks", async () => {
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  const popup = await readFile("src/components/PotholePopup.tsx", "utf8");
  const improve = await readFile("src/components/ImprovePage.tsx", "utf8");
  const compare = await readFile("src/components/CompareSheet.tsx", "utf8");
  const propose = await readFile("src/components/ProposeSheet.tsx", "utf8");
  assert.match(propose, /draftForPothole\(/);
  assert.equal(city.includes("function Pothole"), false);
  assert.equal(city.includes("circleGeometry"), false);
  assert.match(popup, /patchPothole\(/);
  assert.match(popup, /Illustrative street issue/);
  assert.match(popup, /Not a surveyed defect/);
  assert.equal(popup.includes("Improve, Compare"), false);
  assert.match(improve, /patchPothole\(/);
  assert.match(compare, /usePotholeFix\(/);
  assert.match(compare, /Not a Gemini estimate/);
  assert.match(propose, /usePotholeFix\(/);
  assert.equal(compare.includes("amountUsd"), false);
});

test("street improvements include garbage cans and do not affect route state", () => {
  resetStreetImprovements();
  assert.ok(STREET_IMPROVEMENTS.some((item) => item.name === "Add garbage cans"));
  toggleStreetImprovement("add-garbage-cans");
  assert.deepEqual(getStreetImprovementState().selectedIds, ["add-garbage-cans"]);
  toggleStreetImprovement("add-garbage-cans");
  assert.deepEqual(getStreetImprovementState().selectedIds, []);
});
