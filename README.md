# MORROW

**Make tomorrow possible.**

WHACK 2026 · Better Worlds (Social Impact)

Public civic-planning demo. **No login. No judge account.**

## Open the demo

**Public URL** (GitHub Pages custom domain, no login):

[https://morrow.khayrul.com/](https://morrow.khayrul.com/)

`https://lavishsphere.github.io/MORROW/` redirects there. Prefer the custom-domain link: the github.io URL currently 301s to HTTP.

On screen: a top-down satellite of the Wellesley showcase. **See next problem** moves between places from the AI detection pass. Body text is white. The Gemini cost estimate stays in `src/satellite/stats`.

Local fallback (same app, no login):

```bash
npm install
npm run dev
```

Typically `http://localhost:5173`. Production build:

```bash
npm run build && npm run preview
```

### 90-second path (intended judge loop)

1. Open the public URL. The MORROW wordmark stays in the top bar. **Explore | Improve | Compare | Propose** stays on the bottom bar. Arrow keys move between modes.
2. There is no Barriers sidebar. The Wellesley scene fills the width to the right edge.

The bundled intervention is `wellesley-intervention-ramp-01`. Compare math remains `@morrow/routing.compareScenario` on `wellesley-demo-01`. Proposal generation remains the API client. List (2D) is the top-bar alternate to the canvas.

## What the fallbacks do

This is the outage path. It is also the path that ships today. Flags live in `src/data/api.ts` (`API_STATUS`).

| If this is down | What you still get |
|---|---|
| Tiger Data / live barrier API | Bundled Wellesley fixtures (`data/wellesley/`). Banner: live API unavailable. |
| Gemini | Template proposal prose. Labeled unavailable. `aiGenerated` is false. |
| Generate HTTP API | Same template, built in the browser from routing facts. |
| Vultr / any backend | The static Pages (or local) app. No server required for the judge loop. |
| 3D canvas | The Wellesley scene is the page. The mode bar stays. |
| Public Pages URL | `npm run dev` or `npm run preview` on a laptop. |

Routing does **not** fall back to fake numbers. Compare always calls `compareScenario` on the checked-in GeoJSON. Results are **modeled**. The Wellesley barrier is **`illustrative`**.

Ashsmith owns sponsor, live data, API copy, and the Pages custom domain. The table above is what the client does when those services are marked unavailable.

## Front-end stack

**Vite + React + TypeScript** (repo root, npm workspaces).

```bash
npm run lint
npm test
```

### Proposal API (optional)

```bash
npm run api:dev
```

Listens on `http://127.0.0.1:8787`. Vite proxies `/api` there during `npm run dev`.

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | No | Server-only. When unset, generate uses the deterministic template. |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.0-flash`. |
| `DATABASE_URL` | No | Tiger Data / PostGIS with TLS (`sslmode=require`). Unset → bundled dataset. |
| `PORT` / `HOST` | No | Defaults `8787` / `127.0.0.1`. |
| `MORROW_CORS_ORIGIN` | No | Exact origin, or omit for `*`. |
| `VITE_API_BASE` | No | Front-end API base (no trailing slash). Empty = same-origin / proxy. Required for GitHub Pages → hosted API. |

Never put `GEMINI_API_KEY` or `DATABASE_URL` in `VITE_*` vars. Template env shape: [`.env.example`](.env.example). Generate runs the Mastra proposal workflow. For Pages, set the repository Actions variable `VITE_API_BASE` to the public HTTPS API origin after Vultr (or another host) is up — see [`docs/deploy-api-vultr.md`](docs/deploy-api-vultr.md). Details: [`packages/api/README.md`](packages/api/README.md).

## Accessible Interface

- Top bar keeps the MORROW wordmark, the Wellesley selector, Canvas / List (2D), and reduced motion.
- Bottom bar is **Explore | Improve | Compare | Propose**.
- No Barriers sidebar. The scene fills the remaining width to the right edge.
- Compare via `@morrow/routing.compareScenario` (`src/data/compare.ts`) stays in the data layer.
- Propose still calls `POST /api/proposals/generate` when the API is reachable, with a labeled template fallback. The editor opens only in Propose mode.
- Skip link to the mode bar, visible `:focus-visible`, reduced-motion respected.

### Routing

```ts
import { compareScenario } from '@morrow/routing'
```

Do not vendor a second routing package.

## Docs

- [Project plan](docs/MORROW_WHACK_2026_Project_Plan.md) — vision, demo flow, sponsors, and phase gates
- [Team plan](docs/team-plan.md) — four-person seat assignments and handoffs
- [Project context](docs/project-context.md) — short north-star brief for the team
- [Satellite town](docs/satellite-town.md) — top-down camera, AI-detected problems, and where stats live
- [Vultr API host runbook](docs/deploy-api-vultr.md) — GHCR image → Vultr → `VITE_API_BASE` for Pages (blocked until Vultr credentials exist)

## Phase-1 starter data (Wellesley)

Offline showcase bundle so 3D, routing, and the interface can build without Tiger Data or live Overpass:

| Path | Role |
|---|---|
| [`data/wellesley/bbox.json`](data/wellesley/bbox.json) | Small bbox near Wellesley College |
| [`data/wellesley/basemap.geojson`](data/wellesley/basemap.geojson) | OSM roads / buildings / footways / tagged sidewalks |
| [`data/wellesley/demo-dataset.json`](data/wellesley/demo-dataset.json) | One illustrative barrier, intervention, and complete scenario |
| [`shared/types.ts`](shared/types.ts) | `EvidenceStatus`, `Barrier`, `Intervention`, `ProposalFacts`, `DraftProposal` |

Consumer notes and stable ids: [`data/wellesley/README.md`](data/wellesley/README.md).

### Attribution

Basemap data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), extracted via Overpass. Full credit and honesty rules: [`data/wellesley/ATTRIBUTION.md`](data/wellesley/ATTRIBUTION.md).

The seeded Wellesley barrier is **`illustrative`** — a demo simulation, not a verified campus defect. Route results are **modeled**. Always show `evidenceStatus` in the UI and exported proposals.

## Seat

Accessible Interface — Caroline Hu
Routing and Reliability — Sophia Zheng

## CI

Run the same app gates that pull requests run:

```bash
npm ci
npm run ci
```

That lints Markdown and TypeScript, typechecks, tests, builds `dist/`, and audits npm advisories at high severity and above.

| Workflow | When it runs | What it does |
|---|---|---|
| [CI](.github/workflows/ci.yml) | Pull requests and pushes to `main` | App gates, workflow lint, secret scan, offline link check, and a high-severity npm audit |
| [Deploy](.github/workflows/deploy.yml) | Pushes to `main`, or a manual run | Re-runs the app gates and publishes `dist/` to GitHub Pages |
| [CodeQL](.github/workflows/codeql.yml) | Pull requests, pushes to `main`, and Monday | `security-extended` analysis for JavaScript and TypeScript |
| [API image](.github/workflows/api-image.yml) | A `Dockerfile` lands on `main` | Builds the API image and pushes it to GHCR |
| [External links](.github/workflows/links.yml) | Monday, or a manual run | Live check of links in the README, docs, and site |

GitHub Pages is the static demo host. A custom domain is attached, so the judge URL is the domain above. Vite assets are relative (`./`) so they load at `/` on that host and at `/MORROW/` on github.io. A manual deploy can publish another git ref. The API image workflow publishes `Dockerfile` builds to GHCR when API sources change. Model and database credentials are not available to these workflows — inject them on the Vultr host only.

Set repository variable `VITE_API_BASE` so the Pages build can call the hosted API. Until that variable and a live host exist, Propose on Pages stays on the bundled / **unavailable** path (intentional).

`npm run build` writes the Vite app to `dist/`. Pages publishes that folder. The `site/` holding page is not the judge demo.
