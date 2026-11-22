import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { applyCors } from "../packages/api/src/http.ts";

function headersFor(origin: string | undefined, allowed: string | undefined) {
  const before = process.env.MORROW_CORS_ORIGIN;
  if (allowed === undefined) delete process.env.MORROW_CORS_ORIGIN;
  else process.env.MORROW_CORS_ORIGIN = allowed;
  const set: Record<string, string> = {};
  applyCors({ setHeader: (k: string, v: string) => (set[k] = v) } as unknown as ServerResponse, origin);
  if (before === undefined) delete process.env.MORROW_CORS_ORIGIN;
  else process.env.MORROW_CORS_ORIGIN = before;
  return set;
}

test("the API allows each listed site, so both domains work while the site moves", () => {
  const list = "https://plsfixthisshit.work, https://www.plsfixthisshit.work,https://morrow.khayrul.com/";
  assert.equal(headersFor("https://plsfixthisshit.work", list)["access-control-allow-origin"], "https://plsfixthisshit.work");
  assert.equal(headersFor("https://morrow.khayrul.com", list)["access-control-allow-origin"], "https://morrow.khayrul.com");
  assert.equal(headersFor("https://evil.example", list)["access-control-allow-origin"], undefined);
  assert.equal(headersFor("https://any.example", undefined)["access-control-allow-origin"], "*");
  assert.equal(headersFor("https://morrow.khayrul.com", "https://morrow.khayrul.com")["access-control-allow-origin"], "https://morrow.khayrul.com");
});
