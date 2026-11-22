import assert from "node:assert/strict";
import { test } from "node:test";
import { modelCandidates, shouldTryNextModel } from "../src/draft/gemini.ts";

test("a busy or retired Gemini model is followed by other Flash models", () => {
  const previous = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = "gemini-3.8-flash";
  assert.deepEqual(modelCandidates(), [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ]);
  process.env.GEMINI_MODEL = "gemini-3.6-flash";
  const again = modelCandidates();
  assert.equal(again[0], "gemini-3.6-flash");
  assert.equal(again.filter((id) => id === "gemini-3.6-flash").length, 1);
  if (previous === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = previous;
});

test("a non-JSON or empty draft moves on, and a rejected key does not", () => {
  assert.equal(shouldTryNextModel("Gemini returned non-JSON: sure, here is a draft"), true);
  assert.equal(shouldTryNextModel("Empty Gemini response"), true);
  assert.equal(shouldTryNextModel("Gemini draft failed validation: expected string"), true);
  assert.equal(shouldTryNextModel("Gemini timed out after 12000 ms"), true);
  assert.equal(shouldTryNextModel("403 PERMISSION_DENIED API key not valid"), false);
});
