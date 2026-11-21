# MORROW

**Make tomorrow possible.**

WHACK 2026 · Better Worlds (Social Impact)

Public civic-planning demo. **No login. No judge account.**

## Open the demo

**Public URL** (GitHub Pages, after a repo admin sets Settings → Pages → GitHub Actions):

[https://lavishsphere.github.io/MORROW/](https://lavishsphere.github.io/MORROW/)

Until that link loads, use local:

```bash
npm install
npm run dev
```

Typically `http://localhost:5173`. Production build:

```bash
npm run build && npm run preview
```

On screen today: the Wellesley street view. Opening copy says “Make tomorrow possible.” WASD glides on streets and sidewalks. Scroll zooms. Click the curb and it becomes a ramp.

### 90-second path (intended judge loop)

1. Open the URL. Wellesley is the only live location.
2. **Explore** — pick the illustrative curb-ramp barrier (`wellesley-barrier-campus-path-01`). The evidence badge stays **illustrative**.
3. **Improve** — apply the bundled intervention (`wellesley-intervention-ramp-01`).
4. **Compare** — before/after meters come from `@morrow/routing.compareScenario` on `wellesley-demo-01`, not constants.
5. **Propose** — Generate, edit the draft, **Export PDF**. Gemini is not required.

The Accessible Interface chrome for those four modes (toolbar, context panel, **List (2D)**) lives in `src/components/`. The street-view App currently fills the window; List (2D) is the fallback when that chrome is mounted.

## What the fallbacks do

This is the outage path. It is also the path that ships today. Flags live in `src/data/api.ts` (`API_STATUS`).

| If this is down | What you still get |
|---|---|
| Tiger Data / live barrier API | Bundled Wellesley fixtures (`data/wellesley/`). Banner: live API unavailable. |
| Gemini | Template proposal prose. Labeled unavailable. `aiGenerated` is false. |
| Generate HTTP API | Same template, built in the browser from routing facts. |
| Vultr / any backend | The static Pages (or local) app. No server required for the judge loop. |
| 3D canvas | **List (2D)** — same barriers, same modeled meters (`src/components/ListFallback.tsx`). |
| Public Pages URL | `npm run dev` or `npm run preview` on a laptop. |

Routing does **not** fall back to fake numbers. Compare always calls `compareScenario` on the checked-in GeoJSON. Results are **modeled**. The Wellesley barrier is **`illustrative`**.

Ashsmith owns sponsor, live data, and API copy. The table above is what the client does when those services are marked unavailable.

## Front-end stack

**Vite + React + TypeScript** (repo root, npm workspaces).

```bash
npm run lint
npm test
```

## Accessible Interface

- Canvas fills the window as an eye-level street view. WASD glides along streets and sidewalks only. Scroll zooms. Click the curb and it becomes a ramp.
- Wellesley selector + four modes (`src/components/`)
- Explore / Improve context panel with evidence badges
- Compare via `@morrow/routing.compareScenario` (`src/data/compare.ts`)
- Propose: editable template + Export PDF (7 sections, facts-driven)
- **List (2D)** fallback, skip links, visible `:focus-visible`, reduced-motion respected
- Live barrier / generate / Gemini APIs labeled **unavailable**

### Routing

```ts
import { compareScenario } from '@morrow/routing'
```

Do not vendor a second routing package.

## Docs

- [Project plan](docs/MORROW_WHACK_2026_Project_Plan.md) — vision, demo flow, sponsors, and phase gates
- [Team plan](docs/team-plan.md) — four-person seat assignments and handoffs
- [Project context](docs/project-context.md) — short north-star brief for the team

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

GitHub Pages is the static demo host. A manual deploy can publish another git ref. The API image workflow stays idle until a `Dockerfile` exists. Model and database credentials are not available to these workflows.

`npm run build` writes the Vite app to `dist/`. Pages publishes that folder. The `site/` holding page is not the judge demo.
