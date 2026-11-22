import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { defaultRecipientFor, localDay, proposalFileName, townName } from "../src/components/proposalLetter.ts";
import { placeFromEsri } from "../src/data/places.ts";

test("the PDF file name carries the town and the local date", () => {
  const day = new Date(2026, 10, 21, 23, 30);
  assert.equal(localDay(day), "2026-11-21");
  assert.equal(proposalFileName("Wellesley, MA", day), "MORROW Proposal - Wellesley MA - 2026-11-21");
  assert.equal(proposalFileName("St. Louis, MO", day), "MORROW Proposal - St. Louis MO - 2026-11-21");
  assert.equal(proposalFileName("a/b:c", day), "MORROW Proposal - a b c - 2026-11-21");
});

test("the letter is addressed to the right local body", () => {
  assert.equal(townName("Wellesley, MA"), "Wellesley");
  assert.equal(defaultRecipientFor("Wellesley, MA"), "Wellesley Select Board and Department of Public Works");
  assert.equal(defaultRecipientFor("Austin, TX"), "Austin City Council and Department of Public Works");
});

test("the town comes from the geocoder, not the street address", () => {
  const place = placeFromEsri({
    candidates: [
      {
        address: "350 5th Ave, New York, New York, 10118",
        location: { x: -73.9857, y: 40.7484 },
        attributes: { City: "New York", RegionAbbr: "NY" },
      },
    ],
  });
  assert.equal(place?.town, "New York, NY");
});

test("the printed proposal reads as a formal letter, and Export names the PDF", async () => {
  const editor = await readFile("src/components/ProposalEditor.tsx", "utf8");
  const print = await readFile("src/components/printProposal.ts", "utf8");
  for (const part of ["proposal-print__memo", "<dt>To</dt>", "<dt>Re</dt>", "Respectfully submitted", "Signature", "ProposalIssueTable"]) {
    assert.ok(editor.includes(part), part);
  }
  assert.match(print, /if \(fileName\) document\.title = fileName/);
  assert.match(print, /document\.title = title/);
});

test("picking an issue anywhere zooms in on it, looking down", async () => {
  const store = await readFile("src/showcase/issueStore.ts", "utf8");
  const rig = await readFile("src/showcase/scene/CameraRig.tsx", "utf8");
  const list = await readFile("src/components/ProposalIssues.tsx", "utf8");
  assert.match(store, /flyTo\(issue\.x, issue\.z, \{ distance: ISSUE_ZOOM, overhead: true \}\)/);
  assert.match(rig, /fly\.overhead/);
  assert.match(list, /onClick=\{\(\) => selectIssue\(issue\.id\)\}/);
});
