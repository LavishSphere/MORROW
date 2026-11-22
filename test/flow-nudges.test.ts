import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  DISMISSED_KEY,
  NUDGE_STEPS,
  nudgeDelay,
  nudgeFor,
  readDismissed,
  writeDismissed,
} from "../src/components/nextStep.ts";

test("the nudge points along Explore, Improve, Compare, Propose", () => {
  assert.equal(nudgeFor("explore")?.to, "improve");
  assert.equal(nudgeFor("improve")?.to, "compare");
  assert.equal(nudgeFor("compare")?.to, "propose");
  // Propose is the last step.
  assert.equal(nudgeFor("propose"), null);
  assert.deepEqual(
    NUDGE_STEPS.map((step) => `${step.from}>${step.to}`),
    ["explore>improve", "improve>compare", "compare>propose"],
  );
  assert.deepEqual(
    NUDGE_STEPS.map((step) => step.label),
    ["Improve", "Compare", "Propose"],
  );
});

test("the nudge waits a moment, or follows something the resident did", () => {
  const idle = { selected: false, fixes: 0 };
  const explore = nudgeDelay("explore", idle);
  assert.ok(explore !== null && explore >= 3000);
  // Selecting an issue brings the Explore nudge sooner.
  const picked = nudgeDelay("explore", { selected: true, fixes: 0 });
  assert.ok(picked !== null && picked < explore);
  // Improve waits for a fix: Compare is empty without one.
  // Improve always points on to Compare; a fix brings the card sooner.
  const improveIdle = nudgeDelay("improve", idle);
  const improveFixed = nudgeDelay("improve", { selected: false, fixes: 1 });
  assert.ok(improveIdle !== null && improveFixed !== null && improveFixed < improveIdle);
  assert.ok(nudgeDelay("compare", idle) !== null);
  assert.equal(nudgeDelay("propose", { selected: true, fixes: 3 }), null);
});

test("dismissals last the session and survive blocked storage", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
  writeDismissed(storage, new Set(["explore", "compare"] as const));
  assert.deepEqual([...readDismissed(storage)].sort(), ["compare", "explore"]);
  data.set(DISMISSED_KEY, "not json");
  assert.equal(readDismissed(storage).size, 0);
  const blocked = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(readDismissed(blocked).size, 0);
  assert.doesNotThrow(() => writeDismissed(blocked, new Set(["improve"] as const)));
  assert.equal(readDismissed(null).size, 0);
});

test("the nudge switches modes the mode bar's way and can be closed", async () => {
  const app = await readFile("src/App.tsx", "utf8");
  const nudge = await readFile("src/components/FlowNudge.tsx", "utf8");
  const css = await readFile("src/index.css", "utf8");
  assert.match(app, /const nudge = useFlowNudge\(mode\)/);
  assert.match(app, /<FlowNudge step=\{nudge\.step\} onGo=\{changeMode\} onClose=\{nudge\.dismiss\} \/>/);
  assert.match(nudge, /className="flow-nudge__close"/);
  assert.match(nudge, /aria-label=\{`Close the \$\{step\.label\} suggestion`\}/);
  assert.match(nudge, /event\.key === 'Escape'/);
  assert.match(nudge, /role="status"/);
  // It sits in the band above the mode bar, measured like the other overlays.
  const rule = css.match(/\n\.flow-nudge \{[^}]*\}/s);
  assert.ok(rule);
  assert.match(rule[0], /bottom:\s*calc\(var\(--chrome-bottom/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.flow-nudge \{\s*animation: none;/);
});

test("the place details note under the address bar has a close button", async () => {
  const address = await readFile("src/components/AddressBar.tsx", "utf8");
  assert.match(address, /className="place-search__status-close"/);
  assert.match(address, /aria-label="Close place details"/);
  // Closing clears the note; loading the next place sets it again.
  assert.match(address, /setStatus\(''\)\s*\n\s*document\.getElementById\(inputId\)\?\.focus\(\)/);
  assert.match(address, /setStatus\(loaded\.note\)/);
  assert.match(address, /role="status"/);
});
