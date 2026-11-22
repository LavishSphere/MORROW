import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the navbar shows which city is on screen", async () => {
  const bar = await readFile("src/components/TopBar.tsx", "utf8");
  const app = await readFile("src/App.tsx", "utf8");
  assert.match(bar, /className="top-bar__place"/);
  assert.match(bar, /\{placeLabel\}/);
  assert.match(app, /placeLabel=\{neighborhood\?\.place\.label \?\? 'Wellesley, MA'\}/);
});

test("jump to an address stays inside the loaded map and drops a pin", async () => {
  const jump = await readFile("src/components/AddressJump.tsx", "utf8");
  const places = await readFile("src/data/places.ts", "utf8");
  const bar = await readFile("src/components/TopBar.tsx", "utf8");
  const city = await readFile("src/showcase/scene/City.tsx", "utf8");
  assert.match(bar, /<AddressJump \/>/);
  // Suggestions are limited to the map's own area.
  assert.match(places, /searchExtent/);
  assert.match(jump, /suggestAddresses\(text, map\.geoBounds/);
  // An address off the map is refused, not jumped to.
  assert.match(jump, /That address is outside this map/);
  assert.match(jump, /setPin\(\{ label: shortName\(text\), x, z \}\)/);
  assert.match(jump, /flyTo\(x, z, \{ distance: 16 \}\)/);
  assert.match(city, /<AddressPin \/>/);
});

test("Compare switches between today and the fixes and shows their benefits", async () => {
  const compare = await readFile("src/components/IssueComparisons.tsx", "utf8");
  const layer = await readFile("src/showcase/scene/IssueLayer.tsx", "utf8");
  const store = await readFile("src/showcase/issueStore.ts", "utf8");
  assert.match(store, /export function setShowBefore/);
  assert.match(layer, /const fixed = showBefore \? new Set<string>\(\) : improved;/);
  assert.match(compare, />\s*Today\s*</);
  assert.match(compare, />\s*With your fixes\s*</);
  // Leaving Compare puts the fixes back.
  assert.match(compare, /useEffect\(\(\) => \(\) => setShowBefore\(false\), \[\]\)/);
  // Benefits come from the data: modeled detours, measured lengths, real buildings nearby.
  assert.match(compare, /wheelchair detour removed \(modeled\)/);
  assert.match(compare, /buildings within 150 m of a fix/);
  assert.match(compare, /map\.buildingPoints/);
  assert.match(compare, /WHO_BENEFITS/);
});

test("Export PDF prints only the proposal, scaled to one Letter page", async () => {
  const print = await readFile("src/components/printProposal.ts", "utf8");
  const propose = await readFile("src/components/ProposeSheet.tsx", "utf8");
  const css = await readFile("src/index.css", "utf8");
  assert.match(propose, /onExportPdf=\{printProposal\}/);
  assert.match(print, /const PAGE_HEIGHT_PX = 10 \* 96/);
  assert.match(print, /Math\.min\(1, PAGE_HEIGHT_PX \/ Math\.max\(1, height\)\)/);
  assert.match(print, /addEventListener\('afterprint', cleanup\)/);
  assert.match(css, /size: letter;/);
  assert.match(css, /html\.is-printing-proposal body > \*:not\(#print-root\)/);
  assert.match(css, /zoom: var\(--print-zoom, 1\)/);
});
