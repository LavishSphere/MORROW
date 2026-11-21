# MORROW

**Make tomorrow possible.**

WHACK 2026 · Better Worlds (Social Impact)

## Front-end stack

**Vite + React + TypeScript** (repo root, npm workspaces).

## Run locally

```bash
npm install
npm run dev
```

Typically `http://localhost:5173`.

```bash
npm run build && npm run preview
npm run lint
npm test
```

## Accessible Interface

- 3D Showcase: React Three Fiber miniature of Wellesley from `data/wellesley/basemap.geojson`, opening lockup (“Make tomorrow possible”), clickable curb → ramp, orbit camera after descent
- Wellesley selector + four modes
- Explore / Improve context panel with evidence badges
- Compare via `@morrow/routing.compareIntervention` (`src/data/compare.ts`)
- Propose: editable template + Export PDF (7 sections, facts-driven)
- **List (2D)** fallback, skip links, visible `:focus-visible`, reduced-motion respected
- Live barrier / generate / Gemini APIs labeled **unavailable**

### Routing

```ts
import { compareIntervention } from '@morrow/routing'
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

## CI

Run the same app gates that pull requests run:

```bash
npm ci
npm run ci
```

That lints Markdown and TypeScript, typechecks, tests, builds `dist/`, and audits npm advisories at high severity and above.

| Workflow | When it runs | What it does |
| --- | --- | --- |
| [CI](.github/workflows/ci.yml) | Pull requests and pushes to `main` | App gates, workflow lint, secret scan, offline link check, and a high-severity npm audit |
| [Deploy](.github/workflows/deploy.yml) | Pushes to `main`, or a manual run | Re-runs the app gates and publishes `dist/` to GitHub Pages |
| [CodeQL](.github/workflows/codeql.yml) | Pull requests, pushes to `main`, and Monday | `security-extended` analysis for JavaScript and TypeScript |
| [API image](.github/workflows/api-image.yml) | A `Dockerfile` lands on `main` | Builds the API image and pushes it to GHCR |
| [External links](.github/workflows/links.yml) | Monday, or a manual run | Live check of links in the README, docs, and site |

GitHub Pages is the static demo host. A manual deploy can publish another git ref. The API image workflow stays idle until a `Dockerfile` exists. Model and database credentials are not available to these workflows.

`npm run build` writes the Vite app to `dist/`. Pages publishes that folder. The `site/` holding page is not the judge demo.
