# MORROW

**Make tomorrow possible.**

WHACK 2026 · Better Worlds (Social Impact)

An interactive civic-planning experience that helps anyone visualize a more accessible neighborhood and turn an idea for improvement into a concrete proposal for local decision-makers.

**Showcase:** Wellesley, MA (compact area near Wellesley College). Public demo — no login.

## Front-end stack

Accessible Interface uses **Vite + React + TypeScript** (chosen over Next.js for a fast static public demo). State is React component state.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

```bash
npm run build    # production build to dist/
npm run preview  # serve the production build
npm run lint     # oxlint
```

## Accessible Interface (this app)

- Full-bleed **canvas slot** (3D reserved) + compact **Wellesley (featured)** selector
- Bottom toolbar: **Explore | Improve | Compare | Propose** (keyboard: arrows / Home / End)
- Context panel: barriers, evidence badges, intervention options, modeled outcomes
- **Compare** via id-only client stub shaped like Sophia’s `compareIntervention(graph, query, graphChanges)` ([#11](https://github.com/LavishSphere/MORROW/pull/11) / [#12](https://github.com/LavishSphere/MORROW/pull/12)): before/after meters, geometry, assumptions. Bundled mock until `@morrow/routing` merges — **do not vendor a second routing package**
- **Propose**: editable template draft + **Export PDF** (print → Save as PDF) with seven sections; metrics/evidence from the facts object
- **List (2D)** fallback for keyboard/list browsing (MapLibre deferred)
- Reduced-motion toggle; high-contrast evidence/mode labels
- API stubs send **ids only**; live Ashsmith / Gemini / routing package paths labeled **unavailable**

Out of scope in this PR: Gemini server, Tiger Data, Mastra, R3F scene, OSM pipeline, implementing `@morrow/routing` (Sophia’s seat).

## Mocks vs future Ashsmith APIs

| Future API | This PR |
|---|---|
| `GET /api/barriers?bbox=…` | Bundled fixtures; live API flagged unavailable |
| `GET /api/barriers/:id` | Local id lookup |
| `POST /api/proposals/generate` | Client stub: ids in → facts + template draft; Gemini unavailable |
| `GET /api/proposals/:id` | Not wired |
| `compareIntervention` (`@morrow/routing`) | Types + mock in `src/routing/types.ts` / `src/data/compareMock.ts`; swap to Sophia’s package when #11/#12 land |

Client never invents official meters or evidence labels for export — those come from the stub’s `facts` object built from fixtures / compare results.

## Docs

- [Project plan](docs/MORROW_WHACK_2026_Project_Plan.md)
- [Team plan](docs/team-plan.md)
- [Project context](docs/project-context.md)

## Seat

Accessible Interface — Caroline Hu
