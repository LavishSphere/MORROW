import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the city chrome leaves the barrier caption and modeled meters visible", async () => {
  const css = await readFile("src/index.css", "utf8");
  const hidden = css.match(
    /\.app-shell--city \.satellite-town__mark,[\s\S]*?display:\s*none/,
  );
  assert.ok(hidden);
  assert.equal(hidden[0].includes("__caption"), false);
  assert.equal(hidden[0].includes("__meters"), false);
  // Labels sit inside the measured band between the top bar and mode bar.
  assert.match(
    css,
    /\.app-shell--city \.satellite-town__meters \{[^}]*top:\s*calc\(var\(--chrome-top/s,
  );
  assert.match(
    css,
    /\.app-shell--city \.satellite-town__caption \{[^}]*bottom:\s*calc\(var\(--chrome-bottom/s,
  );
});

test("mode pages open in one left panel that clears both bars", async () => {
  const css = await readFile("src/index.css", "utf8");
  const app = await readFile("src/App.tsx", "utf8");
  assert.match(app, /<OverlayPanel open=\{panelOpen\}/);
  assert.match(app, /useChromeInsets\(shellRef\)/);
  const panel = css.match(/\n\.overlay-panel \{[^}]*\}/s);
  assert.ok(panel);
  assert.match(panel[0], /left:\s*var\(--overlay-left\)/);
  assert.match(panel[0], /top:\s*calc\(var\(--chrome-top/);
  assert.match(panel[0], /var\(--chrome-bottom/);
  assert.equal(panel[0].includes("right:"), false);
  // Nothing pins a mode page to the right any more.
  assert.equal(/\.propose-sheet \{[^}]*right:/s.test(css), false);
});
