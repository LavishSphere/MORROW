import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("list view labels a missing trip Unreachable", async () => {
  const list = await readFile("src/components/ListFallback.tsx", "utf8");
  assert.match(list, /return 'Unreachable'/);
  assert.match(list, /Not a Gemini estimate/);
  assert.equal(list.includes("n/a'} m"), false);
  assert.equal(list.includes("4800"), false);
});
