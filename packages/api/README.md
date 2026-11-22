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
| `GET` | `/api/transit/vehicles?feed=<id>` | Live rail vehicle positions as JSON, cached 10 s per feed |

`POST /api/proposals/generate` accepts only:

```json
{ "scenarioId": "…", "barrierId": "…", "interventionId": "…" }
```

Meters, evidence status, and sources are never taken from the client.

## Live transit

`GET /api/transit/vehicles?feed=<id>` fetches one agency's GTFS-realtime (or CTA Train Tracker) feed, decodes vehicle positions and returns `[{ id, lat, lon, bearing, routeId, color, status, updatedAt }]`. Feeds are listed in [`shared/transitFeeds.ts`](../../shared/transitFeeds.ts); any other id is a 404. Mixed bus and rail feeds keep rail routes only.

| Feed | Agency | Key |
| --- | --- | --- |
| `mta-lirr` | Long Island Rail Road | none |
| `mta-mnr` | Metro-North | none |
| `septa` | SEPTA Regional Rail and trolleys | none |
| `metro-transit` | Metro Transit (Minneapolis) light rail | none |
| `rtd` | RTD Denver light and commuter rail | none |
| `wmata` | WMATA Metrorail | `WMATA_API_KEY` |
| `cta` | CTA 'L' | `CTA_TRAIN_TRACKER_KEY` |
| `metra` | Metra | `METRA_API_TOKEN` |
| `trimet` | TriMet MAX and WES | `TRIMET_APP_ID` |
| `muni` | Muni Metro, streetcars, cable cars | `SF511_API_KEY` (cached 60 s for 511's hourly limit) |

A keyed feed without its env var answers 501, and the web app stops polling it. An upstream error answers 502 (504 on timeout) unless a good answer from the last two minutes can be served instead.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | No | — | Server-side Google Gemini key. When unset, the deterministic template always runs. |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | First model to try. A retired or busy model is followed by other Flash models. |
| `DATABASE_URL` | No | — | Tiger Data / PostGIS URL with TLS (`sslmode=require`). When unset or unreachable, the API uses the bundled dataset. |
| `WMATA_API_KEY`, `CTA_TRAIN_TRACKER_KEY`, `METRA_API_TOKEN`, `TRIMET_APP_ID`, `SF511_API_KEY` | No | — | Free developer keys for the keyed live transit feeds above. Sent only from the server. |
| `PORT` | No | `8787` | Listen port. `SERVER_PORT` wins when Pterodactyl sets it. |
| `HOST` | No | `127.0.0.1` | Bind address. `0.0.0.0` when `SERVER_PORT` is set and `HOST` is empty. |
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

Set `VITE_API_BASE=http://127.0.0.1:8787` (no trailing slash) so the Vite app can call these endpoints. For GitHub Pages, set the repository Actions variable `VITE_API_BASE` to the public HTTPS API origin, such as `https://api.morrow.khayrul.com`. When the API is down, the UI keeps the bundled fixtures and labels generate / Gemini **unavailable**.

## Pterodactyl

Import [`pterodactyl/morrow-api.json`](../../pterodactyl/morrow-api.json) as an egg. The image is `ghcr.io/lavishsphere/morrow:latest`. The panel allocation is `SERVER_PORT`. Put `DATABASE_URL` and `GEMINI_API_KEY` in the egg variables, not in git. Nginx on the VPS proxies public HTTPS to that allocation.
