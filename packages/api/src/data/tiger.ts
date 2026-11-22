/**
 * Optional Tiger Data / PostGIS access (WHA-9).
 *
 * When DATABASE_URL is unset or the database is unreachable, callers must
 * fall back to the bundled Wellesley dataset. Never invent credentials.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type {
  Barrier,
  GenerateProposalResponse,
} from "../../../../shared/types.ts";
import { dataset, listBarriers } from "./dataset.ts";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let live = false;
let lastError: string | null = null;

export function databaseUrlConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function tigerLive(): boolean {
  return live;
}

export function tigerLastError(): string | null {
  return lastError;
}

function connectionString(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  return raw || undefined;
}

/**
 * node-pg treats sslmode=require as verify-full. Tiger Cloud's chain is not
 * in Node's trust store, so that check fails with a self-signed certificate.
 * uselibpqcompat keeps require as "encrypt, do not reject that chain."
 */
export function connectionStringForNode(url: string): string {
  if (!/sslmode=require(?:&|$)/i.test(url)) return url;
  if (/uselibpqcompat=/i.test(url)) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}uselibpqcompat=true`;
}

/** Open a pool when DATABASE_URL is set; probe with SELECT 1 + PostGIS. */
export async function initTiger(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const url = connectionString();
  if (!url) {
    live = false;
    lastError = null;
    return { ok: false, reason: "DATABASE_URL not set" };
  }

  await closeTiger();

  pool = new Pool({
    connectionString: connectionStringForNode(url),
    // Tiger Cloud requires TLS; sslmode in the URL is respected by libpq.
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      const ext = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM pg_extension WHERE extname = 'postgis'
         ) AS exists`,
      );
      if (!ext.rows[0]?.exists) {
        throw new Error("postgis extension not installed");
      }
      live = true;
      lastError = null;
      return { ok: true };
    } finally {
      client.release();
    }
  } catch (err) {
    live = false;
    lastError = err instanceof Error ? err.message : "Tiger Data connect failed";
    await closeTiger();
    return { ok: false, reason: lastError };
  }
}

export async function closeTiger(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = null;
    live = false;
    await closing.end().catch(() => undefined);
  }
}

function rowToBarrier(row: {
  id: string;
  lon: number;
  lat: number;
  type: Barrier["type"];
  evidence_status: Barrier["evidenceStatus"];
  description: string;
  source: string | null;
  source_title: string | null;
  source_url: string | null;
  observed_at: string | null;
  location_label: string | null;
  city: string | null;
}): Barrier {
  return {
    id: row.id,
    coordinates: [row.lon, row.lat],
    type: row.type,
    evidenceStatus: row.evidence_status,
    description: row.description,
    ...(row.source ? { source: row.source } : {}),
    ...(row.source_title ? { sourceTitle: row.source_title } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.observed_at ? { observedAt: row.observed_at } : {}),
    ...(row.location_label ? { locationLabel: row.location_label } : {}),
    ...(row.city ? { city: row.city } : {}),
  };
}

/** Parameterized bbox query using the GiST index on geography. */
export async function barriersInBboxFromTiger(
  west: number,
  south: number,
  east: number,
  north: number,
  limit = 100,
): Promise<Barrier[] | null> {
  if (!pool || !live) return null;
  try {
    const result = await pool.query(
      `SELECT id, lon, lat, type, evidence_status, description,
              source, source_title, source_url, observed_at,
              location_label, city
         FROM barriers
        WHERE ST_Intersects(
                geom,
                ST_SetSRID(ST_MakeEnvelope($1, $2, $3, $4), 4326)::geography
              )
        ORDER BY id
        LIMIT $5`,
      [west, south, east, north, limit],
    );
    return result.rows.map(rowToBarrier);
  } catch (err) {
    lastError = err instanceof Error ? err.message : "bbox query failed";
    live = false;
    return null;
  }
}

export async function getBarrierFromTiger(
  id: string,
): Promise<Barrier | null | undefined> {
  if (!pool || !live) return undefined;
  try {
    const result = await pool.query(
      `SELECT id, lon, lat, type, evidence_status, description,
              source, source_title, source_url, observed_at,
              location_label, city
         FROM barriers
        WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return rowToBarrier(result.rows[0]);
  } catch (err) {
    lastError = err instanceof Error ? err.message : "barrier lookup failed";
    live = false;
    return undefined;
  }
}

export async function saveProposalToTiger(
  record: GenerateProposalResponse,
): Promise<boolean> {
  if (!pool || !live) return false;
  try {
    await pool.query(
      `INSERT INTO proposals (id, barrier_id, scenario_id, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET payload = EXCLUDED.payload,
             barrier_id = EXCLUDED.barrier_id,
             scenario_id = EXCLUDED.scenario_id`,
      [
        record.proposalId,
        null,
        null,
        JSON.stringify(record),
      ],
    );
    return true;
  } catch (err) {
    lastError = err instanceof Error ? err.message : "proposal save failed";
    return false;
  }
}

export async function getProposalFromTiger(
  id: string,
): Promise<GenerateProposalResponse | null | undefined> {
  if (!pool || !live) return undefined;
  try {
    const result = await pool.query(
      `SELECT payload FROM proposals WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].payload as GenerateProposalResponse;
  } catch (err) {
    lastError = err instanceof Error ? err.message : "proposal lookup failed";
    return undefined;
  }
}

/** Upsert bundled Wellesley barriers into PostGIS (idempotent seed). */
export async function seedBarriersFromBundled(): Promise<{
  upserted: number;
}> {
  if (!pool || !live) {
    throw new Error(
      lastError ?? "Tiger Data is not connected — set DATABASE_URL and call initTiger()",
    );
  }

  const barriers = listBarriers().length > 0 ? listBarriers() : dataset.barriers;
  let upserted = 0;
  for (const b of barriers) {
    const [lon, lat] = b.coordinates;
    await pool.query(
      `INSERT INTO barriers (
         id, lon, lat, geom, type, evidence_status, description,
         source, source_title, source_url, observed_at, location_label, city, payload
       ) VALUES (
         $1, $2, $3,
         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
         $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         lon = EXCLUDED.lon,
         lat = EXCLUDED.lat,
         geom = EXCLUDED.geom,
         type = EXCLUDED.type,
         evidence_status = EXCLUDED.evidence_status,
         description = EXCLUDED.description,
         source = EXCLUDED.source,
         source_title = EXCLUDED.source_title,
         source_url = EXCLUDED.source_url,
         observed_at = EXCLUDED.observed_at,
         location_label = EXCLUDED.location_label,
         city = EXCLUDED.city,
         payload = EXCLUDED.payload,
         updated_at = now()`,
      [
        b.id,
        lon,
        lat,
        b.type,
        b.evidenceStatus,
        b.description,
        b.source ?? null,
        b.sourceTitle ?? null,
        b.sourceUrl ?? null,
        b.observedAt ?? null,
        b.locationLabel ?? null,
        b.city ?? null,
        JSON.stringify(b),
      ],
    );
    upserted += 1;
  }
  return { upserted };
}

export function schemaSqlPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../sql/schema.sql");
}

export function readSchemaSql(): string {
  return readFileSync(schemaSqlPath(), "utf8");
}
