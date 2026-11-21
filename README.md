# MORROW

**Make tomorrow possible.**

## Run locally

```bash
npm install
npm run dev
```

## This PR — Propose + Export PDF

- Editable template draft (Gemini labeled **unavailable**)
- **Export PDF** via print styles — seven sections
- Metrics and evidence badges render from the `facts` object (not invented client prose)
- Generate stub accepts **ids only**

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
