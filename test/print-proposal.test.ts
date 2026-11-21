import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the printed proposal uses modeled meters and hides the generate button", async () => {
  const editor = await readFile("src/components/ProposalEditor.tsx", "utf8");
  const css = await readFile("src/index.css", "utf8");
  assert.match(editor, /formatMeters\(facts\.beforeMeters\)/);
  assert.match(editor, /formatMeters\(facts\.afterMeters\)/);
  assert.equal(editor.includes("n/a"), false);
  const printBlock = css.slice(css.indexOf("@media print"));
  assert.match(printBlock, /\.propose-sheet__generate/);
  assert.match(printBlock, /\.dream-sky/);
});
