-- MORROW Tiger Data / PostGIS schema (WHA-9).
-- Apply against a Tiger Cloud or local PostGIS database:
--   psql "$DATABASE_URL" -f packages/api/sql/schema.sql
-- Then seed: npm run api:seed -w @morrow/api
-- Never commit real DATABASE_URL values.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS barriers (
  id TEXT PRIMARY KEY,
  lon DOUBLE PRECISION NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  geom GEOGRAPHY(POINT, 4326) NOT NULL,
  type TEXT NOT NULL,
  evidence_status TEXT NOT NULL CHECK (
    evidence_status IN ('verified', 'community_reported', 'illustrative')
  ),
  description TEXT NOT NULL,
  source TEXT,
  source_title TEXT,
  source_url TEXT,
  observed_at TEXT,
  location_label TEXT,
  city TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS barriers_geom_gix ON barriers USING GIST (geom);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  barrier_id TEXT,
  scenario_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposals_created_at_idx ON proposals (created_at DESC);
