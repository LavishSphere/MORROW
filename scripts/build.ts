import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";

const artifactDir = "dist";
const webAppDir = "apps/web";

function fail(message: string): never {
  throw new Error(message);
}

if (existsSync(`${webAppDir}/package.json`)) {
  const result = spawnSync("npm", ["run", "build"], {
    cwd: webAppDir,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    fail(
      `apps/web build exited with status ${String(result.status)} signal ${String(result.signal)}`,
    );
  }
  if (existsSync(`${webAppDir}/dist`)) {
    await rm(artifactDir, { recursive: true, force: true });
    await cp(`${webAppDir}/dist`, artifactDir, { recursive: true });
  }
} else {
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });
  await cp("site", artifactDir, { recursive: true });
}

if (!existsSync(`${artifactDir}/index.html`)) {
  fail("Build did not produce dist/index.html");
}
