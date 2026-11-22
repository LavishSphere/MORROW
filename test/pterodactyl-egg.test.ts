import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the Pterodactyl egg runs the public API image and stores no secrets", async () => {
  const egg = JSON.parse(await readFile("pterodactyl/morrow-api.json", "utf8")) as {
    meta: { version: string };
    docker_images: Record<string, string>;
    startup: string;
    variables: Array<{ env_variable: string; default_value: string }>;
  };
  const dockerfile = await readFile("Dockerfile", "utf8");
  const start = await readFile("start-api.sh", "utf8");

  assert.equal(egg.meta.version, "PTDL_v2");
  assert.equal(
    egg.docker_images["MORROW API"],
    "ghcr.io/lavishsphere/morrow:latest",
  );
  assert.equal(egg.startup, "/app/start-api.sh");
  assert.match(dockerfile, /COPY --chmod=755 start-api\.sh \/app\/start-api\.sh/);
  assert.match(dockerfile, /CMD \["\/app\/start-api\.sh"\]/);
  assert.match(start, /\/app\/packages\/api\/src\/index\.ts/);
  assert.equal(/vultr/i.test(dockerfile), false);
  assert.equal(/vultr/i.test(start), false);

  const names = egg.variables.map((variable) => variable.env_variable);
  assert.deepEqual(names, [
    "DATABASE_URL",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "MORROW_CORS_ORIGIN",
  ]);
  for (const variable of egg.variables) {
    assert.equal(variable.default_value.includes("postgresql://"), false);
    assert.equal(variable.default_value.includes("://"), false);
  }
  assert.equal(
    egg.variables.find((variable) => variable.env_variable === "GEMINI_API_KEY")
      ?.default_value,
    "",
  );
  assert.equal(
    egg.variables.find((variable) => variable.env_variable === "DATABASE_URL")
      ?.default_value,
    "",
  );
});
