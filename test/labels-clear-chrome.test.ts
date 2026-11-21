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
  assert.match(css, /\.app-shell--city \.satellite-town__meters \{[^}]*top:\s*4\.6rem/s);
  assert.match(
    css,
    /\.app-shell--city \.satellite-town__caption \{[^}]*bottom:\s*5\.8rem/s,
  );
});
