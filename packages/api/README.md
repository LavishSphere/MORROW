# `@morrow/api`

Proposal and barrier HTTP API for MORROW (Ashsmith lane).

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness + whether Gemini is configured |
| `GET` | `/api/barriers?bbox=west,south,east,north` | In-memory bbox filter over the Wellesley demo dataset |
| `GET` | `/api/barriers/:id` | One barrier, or 404 |
| `POST` | `/api/proposals/generate` | Ids only → reload dataset → `@morrow/routing` recompute → Gemini or template |
| `GET` | `/api/proposals/:id` | Saved draft from the in-memory store |

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
| `PORT` | No | `8787` | Listen port |
| `HOST` | No | `127.0.0.1` | Bind address |
| `MORROW_CORS_ORIGIN` | No | `*` | Exact browser origin to allow, or omit for `*` |

Do **not** put `GEMINI_API_KEY` in Vite `VITE_*` env vars or ship it to the browser.

`POST /api/proposals/generate` runs a **Mastra** typed workflow (`morrow-proposal`): validate ids → load evidence → collect route metrics → generate → check → return. The response includes `mastra: true` and `workflowSteps`.

Tiger Data / PostGIS (`DATABASE_URL`) and Vultr hosting are **not** claimed in this package yet (see WHA-9).

## Run

From the repo root (after `npm install`):

```bash
npm run api:dev
```

Or:

```bash
npm run api -w @morrow/api
```

Template-only smoke (no key):

```bash
curl -s "http://127.0.0.1:8787/api/health"
curl -s "http://127.0.0.1:8787/api/barriers?bbox=-71.3085,42.291,-71.3005,42.2968"
curl -s -X POST "http://127.0.0.1:8787/api/proposals/generate" \
  -H "content-type: application/json" \
  -d '{"scenarioId":"wellesley-demo-01","barrierId":"wellesley-barrier-campus-path-01","interventionId":"wellesley-intervention-ramp-01"}'
```

## Frontend

Set `VITE_API_BASE=http://127.0.0.1:8787` (no trailing slash) so the Vite app can call these endpoints. When the API is down, the UI keeps the bundled fixtures and labels generate / Gemini **unavailable**.
