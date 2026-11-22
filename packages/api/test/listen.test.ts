import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveListenAddress } from "../src/server.ts";

test("local API binds loopback on 8787", () => {
  assert.deepEqual(resolveListenAddress({}), { port: 8787, host: "127.0.0.1" });
});

test("PORT and HOST override the local defaults", () => {
  assert.deepEqual(
    resolveListenAddress({ PORT: "9000", HOST: "0.0.0.0" }),
    { port: 9000, host: "0.0.0.0" },
  );
});

test("Pterodactyl SERVER_PORT wins and binds all interfaces", () => {
  assert.deepEqual(
    resolveListenAddress({ SERVER_PORT: "25565", PORT: "8787" }),
    { port: 25565, host: "0.0.0.0" },
  );
});

test("a bad port falls back to 8787", () => {
  assert.equal(resolveListenAddress({ PORT: "nope" }).port, 8787);
});
