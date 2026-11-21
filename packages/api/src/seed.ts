/**
 * Apply schema (optional) and upsert bundled Wellesley barriers into PostGIS.
 *
 * Usage (from repo root, after setting DATABASE_URL — never commit the value):
 *   npm run api:seed -w @morrow/api
 */

import { readFileSync } from "node:fs";
import {
  closeTiger,
  initTiger,
  readSchemaSql,
  schemaSqlPath,
  seedBarriersFromBundled,
} from "./data/tiger.ts";
import pg from "pg";

const applySchema = process.argv.includes("--schema");

async function main(): Promise<void> {
  const tiger = await initTiger();
  if (!tiger.ok) {
    console.error(`[@morrow/api] seed aborted: ${tiger.reason}`);
    console.error(
      "Set DATABASE_URL to a Tiger Cloud / PostGIS URL with sslmode=require (do not commit secrets).",
    );
    process.exitCode = 1;
    return;
  }

  if (applySchema) {
    const sql = readSchemaSql();
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      process.exitCode = 1;
      return;
    }
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(sql);
      console.log(`[@morrow/api] applied schema from ${schemaSqlPath()}`);
    } finally {
      await client.end();
    }
    // Re-init pool after schema apply (fresh connection state).
    await closeTiger();
    const again = await initTiger();
    if (!again.ok) {
      console.error(`[@morrow/api] reconnect after schema failed: ${again.reason}`);
      process.exitCode = 1;
      return;
    }
  } else {
    // Touch schema path so operators know where it lives.
    void readFileSync(schemaSqlPath(), "utf8");
  }

  const { upserted } = await seedBarriersFromBundled();
  console.log(
    `[@morrow/api] seeded ${upserted} barrier(s) from data/wellesley/demo-dataset.json`,
  );
  await closeTiger();
}

await main();
