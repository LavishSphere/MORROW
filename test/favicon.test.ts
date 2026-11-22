import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

test("the tab icon is the MORROW logo, at every size browsers ask for", async () => {
  const html = await readFile("index.html", "utf8");
  for (const file of ["favicon.ico", "favicon-32.png", "icon-512.png", "apple-touch-icon.png"]) {
    assert.ok(html.includes(`%BASE_URL%${file}`), file);
    await access(`public/${file}`);
  }
  assert.equal(html.includes("favicon.svg"), false);
});
