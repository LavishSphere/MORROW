import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

const workflowDir = ".github/workflows";
const expectedWorkflows = ["api-image.yml", "ci.yml", "codeql.yml", "deploy.yml", "links.yml"];

const forbidden = [
  "pull_request_target",
  "write-all",
  "GEMINI_API_KEY",
  "DATABASE_URL",
];

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.ok(value);
  assert.equal(Array.isArray(value), false, label);
  return value as Record<string, unknown>;
}

async function readWorkflow(name: string): Promise<string> {
  return readFile(`${workflowDir}/${name}`, "utf8");
}

test("workflow files match the pipeline contract", async () => {
  const found = (await readdir(workflowDir)).sort();
  for (const name of expectedWorkflows) {
    assert.ok(found.includes(name), name);
  }

  for (const name of expectedWorkflows) {
    const text = await readWorkflow(name);
    for (const phrase of forbidden) {
      assert.equal(text.includes(phrase), false, `${name} contains ${phrase}`);
    }
    assert.match(text, /persist-credentials:\s*false/);
    const document = asRecord(parse(text), name);
    assert.ok(document["jobs"], `${name} declares jobs`);
  }
});

test("CI jobs cover app and quality", async () => {
  const document = asRecord(parse(await readWorkflow("ci.yml")), "ci");
  const jobs = asRecord(document["jobs"], "ci jobs");
  assert.ok(jobs["app"]);
  assert.ok(jobs["quality"]);
});

test("deploy publishes dist to GitHub Pages", async () => {
  const text = await readWorkflow("deploy.yml");
  const document = asRecord(parse(text), "deploy");
  const jobs = asRecord(document["jobs"], "deploy jobs");
  const deploy = asRecord(jobs["deploy"], "deploy job");
  const environment = asRecord(deploy["environment"], "pages environment");
  assert.equal(environment["name"], "github-pages");
  assert.match(text, /path:\s*dist/);
  assert.match(text, /VITE_BASE=\.\//);
  assert.match(text, /enablement:\s*true/);
  assert.match(text, /\/MORROW\/assets\//);
});

test("package scripts expose the local CI entrypoint", async () => {
  const pkg = asRecord(
    JSON.parse(await readFile("package.json", "utf8")) as unknown,
    "package.json",
  );
  const scripts = asRecord(pkg["scripts"], "scripts");
  for (const name of ["lint", "lint:md", "typecheck", "test", "build", "ci"]) {
    assert.equal(typeof scripts[name], "string", name);
  }
});

test("gitignore keeps install and build output out of git", async () => {
  const gitignore = await readFile(".gitignore", "utf8");
  assert.match(gitignore, /^node_modules\/$/m);
  assert.match(gitignore, /^dist\/$/m);
});

test("holding page is a static accessible document", async () => {
  const html = await readFile("site/index.html", "utf8");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<h1>MORROW<\/h1>/);
  assert.match(html, /Make tomorrow possible\./);
  assert.equal(html.includes("<script"), false);
});

test("build copies the holding page into dist", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/build.ts"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return Promise.all([
    readFile("site/index.html", "utf8"),
    readFile("dist/index.html", "utf8"),
  ]).then(([source, built]) => {
    assert.equal(built, source);
  });
});
