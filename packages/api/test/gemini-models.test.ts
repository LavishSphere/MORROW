import assert from "node:assert/strict";
import { test } from "node:test";
import { draftableModels, modelCandidates, PRIMARY_MODEL, shouldTryNextModel } from "../src/draft/gemini.ts";

test("gemini-3.8-flash is always tried first, even when GEMINI_MODEL names an older model", () => {
  const previous = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = "gemini-2.0-flash";
  const order = modelCandidates();
  assert.equal(PRIMARY_MODEL, "gemini-3.8-flash");
  assert.equal(order[0], "gemini-3.8-flash");
  assert.equal(order[1], "gemini-2.0-flash");
  process.env.GEMINI_MODEL = "gemini-3.8-flash";
  const plain = modelCandidates();
  assert.deepEqual(plain.slice(0, 2), ["gemini-3.8-flash", "gemini-3.6-flash"]);
  assert.equal(plain.filter((id) => id === "gemini-3.8-flash").length, 1);
  if (previous === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = previous;
});

test("every draftable model the key can see is tried after 3.8, newest first, once each", () => {
  const listed = draftableModels([
    { name: "models/gemini-3.6-flash", supportedActions: ["generateContent"] },
    { name: "models/gemini-3.8-flash", supportedActions: ["generateContent"] },
    { name: "models/gemini-3.8-pro", supportedActions: ["generateContent"] },
    { name: "models/gemini-3.8-flash-lite", supportedActions: ["generateContent"] },
    { name: "models/gemini-embedding-001", supportedActions: ["embedContent"] },
    { name: "models/gemini-3.8-flash-image", supportedActions: ["generateContent"] },
    { name: "models/gemini-3.6-flash-tts", supportedActions: ["generateContent"] },
    { name: "models/gemini-3.5-flash-preview-09", supportedActions: ["generateContent"] },
    { name: "models/gemini-3.5-flash", supportedActions: ["generateContent"] },
    { name: "models/imagen-4", supportedActions: ["predict"] },
  ]);
  assert.deepEqual(listed, [
    "gemini-3.8-flash",
    "gemini-3.8-flash-lite",
    "gemini-3.8-pro",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-preview-09",
  ]);
  const order = modelCandidates("gemini-3.8-flash", listed);
  assert.equal(order[0], "gemini-3.8-flash");
  assert.deepEqual(order.slice(1, 6), ["gemini-3.8-flash-lite", "gemini-3.8-pro", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-preview-09"]);
  assert.equal(new Set(order).size, order.length);
});

test("busy, retired, and broken replies move on; a rejected key does not", () => {
  assert.equal(shouldTryNextModel("503 UNAVAILABLE The model is overloaded due to high demand"), true);
  assert.equal(shouldTryNextModel("429 RESOURCE_EXHAUSTED"), true);
  assert.equal(shouldTryNextModel("500 INTERNAL"), true);
  assert.equal(shouldTryNextModel("404 NOT_FOUND models/gemini-2.0-flash is no longer available"), true);
  assert.equal(shouldTryNextModel("Gemini returned non-JSON: sure, here is a draft"), true);
  assert.equal(shouldTryNextModel("Empty Gemini response"), true);
  assert.equal(shouldTryNextModel("Gemini draft failed validation: expected string"), true);
  assert.equal(shouldTryNextModel("Gemini timed out after 12000 ms"), true);
  assert.equal(shouldTryNextModel("403 PERMISSION_DENIED API key not valid"), false);
});
