import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  STREET_IMPROVEMENTS,
  draftForStreetImprovements,
  improvementsByIds,
} from "../src/city/streetImprovements.ts";

const base = {
  headline: "Wellesley route",
  plainLanguageSummary: "Modeled trip stays here.",
  requestForReview: "Please review the ramp.",
  meetingTalkingPoints: ["Ramp at the crossing."],
  limitations: "Illustrative scenario.",
};

test("draftForStreetImprovements leaves the draft unchanged when nothing is selected", () => {
  assert.equal(draftForStreetImprovements(base, []), base);
});

test("improvementsByIds keeps catalog order and skips unknown ids", () => {
  const picked = improvementsByIds(["add-recycling", "nope", "add-garbage-cans"]);
  assert.deepEqual(
    picked.map((item) => item.id),
    ["add-garbage-cans", "add-recycling"],
  );
  assert.equal(improvementsByIds([]).length, 0);
  assert.equal(STREET_IMPROVEMENTS.length >= 5, true);
});

test("selected garbage cans appear in talking points, summary, and limitations", () => {
  const draft = draftForStreetImprovements(base, improvementsByIds(["add-garbage-cans"]));
  assert.equal(draft.headline, "Wellesley route");
  assert.ok(draft.meetingTalkingPoints.some((point) => /Add garbage cans/.test(point)));
  assert.ok(draft.meetingTalkingPoints.includes("Ramp at the crossing."));
  assert.match(draft.plainLanguageSummary, /Modeled trip stays here/);
  assert.match(draft.plainLanguageSummary, /Add garbage cans/);
  assert.match(draft.requestForReview, /Add garbage cans/);
  assert.match(draft.limitations, /^Illustrative scenario\./);
  assert.match(draft.limitations, /illustrative and do not change the modeled route distance/);
});

test("Propose and Compare read the selected street improvements", async () => {
  const propose = await readFile("src/components/ProposeSheet.tsx", "utf8");
  const compare = await readFile("src/components/CompareSheet.tsx", "utf8");
  assert.match(propose, /useStreetImprovements\(/);
  assert.match(propose, /draftForStreetImprovements\(draftForPothole\(/);
  assert.match(propose, /Includes: /);
  assert.match(compare, /useStreetImprovements\(/);
  assert.match(compare, /Proposed/);
  assert.equal(compare.includes("amountUsd"), false);
});
