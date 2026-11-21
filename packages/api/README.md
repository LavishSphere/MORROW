# `@morrow/api`

Proposal and barrier HTTP API for MORROW (Ashsmith lane).

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness + Gemini / Tiger Data flags |
| `GET` | `/api/barriers?bbox=west,south,east,north` | PostGIS bbox when Tiger Data is live; else bundled Wellesley dataset |
| `GET` | `/api/barriers/:id` | One barrier (Tiger Data first, then bundled), or 404 |
| `POST` | `/api/proposals/generate` | Ids only → reload dataset → `@morrow/routing` recompute → Gemini or template |
| `GET` | `/api/proposals/:id` | Saved draft (memory, then Tiger Data) |

`POST /api/proposals/generate` accepts only:

```json
{ "scenarioId": "…", "barrierId": "…", "interventionId": "…" }
```

Meters, evidence status, and sources are never taken from the client.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | No | — | Server-side Google Gemini key. When unset, the deterministic template always runs. |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Model id for `@google/genai` |
| `DATABASE_URL` | No | — | Tiger Data / PostGIS URL with TLS (`sslmode=require`). When unset or unreachable, the API uses the bundled dataset. |
| `PORT` | No | `8787` | Listen port |
| `HOST` | No | `127.0.0.1` | Bind address |
| `MORROW_CORS_ORIGIN` | No | `*` | Exact browser origin to allow, or omit for `*` |

Do **not** put `GEMINI_API_KEY` or `DATABASE_URL` in Vite `VITE_*` env vars or ship them to the browser. See the repo root [`.env.example`](../../.env.example) for the template shape (no real secrets).

`POST /api/proposals/generate` runs a **Mastra** typed workflow (`morrow-proposal`): validate ids → load evidence → collect route metrics → generate → check → return. The response includes `mastra: true` and `workflowSteps`.

## Tiger Data / PostGIS

1. Create a Tiger Cloud (or local PostGIS) service.
2. Set `DATABASE_URL` locally — never commit the value.
3. Apply schema and seed the Wellesley illustrative barrier (`psql "$DATABASE_URL" -f packages/api/sql/schema.sql`, or `npm run api:seed -- --schema`, then `npm run api:seed`).
4. Restart the API. `GET /api/health` should show `tigerData: true`. `GET /api/barriers?bbox=…` should report `source: "tiger-data"`.

If the database is down, barriers and generate keep working on the bundled dataset; health reports `tigerData: false`.

## Run

From the repo root (after `npm install`):

```bash
npm run api:dev
```

Or:

```bash
npm run api -w @morrow/api
```

Template-only smoke (no key, no database):

```bash
curl -s "http://127.0.0.1:8787/api/health"
curl -s "http://127.0.0.1:8787/api/barriers?bbox=-71.3085,42.291,-71.3005,42.2968"
curl -s -X POST "http://127.0.0.1:8787/api/proposals/generate" \
  -H "content-type: application/json" \
  -d '{"scenarioId":"wellesley-demo-01","barrierId":"wellesley-barrier-campus-path-01","interventionId":"wellesley-intervention-ramp-01"}'
```

## Frontend

Set `VITE_API_BASE=http://127.0.0.1:8787` (no trailing slash) so the Vite app can call these endpoints. For GitHub Pages, set the repository Actions variable `VITE_API_BASE` to the public HTTPS API origin (see [`docs/deploy-api-vultr.md`](../../docs/deploy-api-vultr.md)). When the API is down, the UI keeps the bundled fixtures and labels generate / Gemini **unavailable**.

Set `MORROW_HOSTED_ON=vultr` on the Vultr container so `GET /api/health` reports `"vultr": true`. Do not claim Vultr until that public health check succeeds.
