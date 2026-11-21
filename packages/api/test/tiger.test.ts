import assert from "node:assert/strict";
import { test } from "node:test";
import {
  databaseUrlConfigured,
  readSchemaSql,
  schemaSqlPath,
  tigerLive,
} from "../src/data/tiger.ts";

test("Tiger Data stays off without DATABASE_URL", () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  assert.equal(databaseUrlConfigured(), false);
  assert.equal(tigerLive(), false);
  if (previous !== undefined) process.env.DATABASE_URL = previous;
});

test("schema.sql declares PostGIS, barriers GiST, and proposals", () => {
  const sql = readSchemaSql();
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS postgis/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS barriers/i);
  assert.match(sql, /USING GIST \(geom\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS proposals/i);
  assert.match(schemaSqlPath(), /schema\.sql$/);
});
