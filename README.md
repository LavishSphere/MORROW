# MORROW

**Make tomorrow possible.**

WHACK 2026 · Better Worlds (Social Impact)

An interactive civic-planning experience that helps anyone visualize a more accessible neighborhood and turn an idea for improvement into a concrete proposal for local decision-makers.

**Showcase:** Wellesley, MA (compact area near Wellesley College). Public demo — no login.

## Front-end stack

This Accessible Interface app uses **Vite + React + TypeScript** (chosen over Next.js for a fast static public demo). State is React component state for Phase 1.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173`).

Other scripts:

```bash
npm run build    # production build to dist/
npm run preview  # serve the production build
npm run lint     # oxlint
```

## Phase 1 app shell

What this PR delivers:

- Full-bleed layout with a clear **3D canvas slot** (placeholder for React Three Fiber)
- Compact **Wellesley (featured)** location selector
- Bottom toolbar: **Explore | Improve | Compare | Propose** (working mode switch, keyboard-focusable with arrow keys)
- **Context panel** for barrier / evidence / options / outcomes / proposal shell
- **Reduced-motion** toggle (wired; honors `prefers-reduced-motion` on load)
- **Bundled mock fixtures** so the UI runs without a backend

Out of scope here: real Gemini / Tiger / Mastra, routing math, R3F scene, PDF export polish, MapLibre 2D map, multi-city.

## Mocks vs future Ashsmith APIs

Phase 1 loads barriers and the demo scenario from `src/data/fixtures.ts` via `src/data/api.ts`.

| Future API | Phase 1 behavior |
|---|---|
| `GET /api/barriers?bbox=…` | Bundled Wellesley barriers |
| `GET /api/barriers/:id` | Local fixture lookup |
| `POST /api/proposals/generate` | Propose mode shows a shell only — no network call |
| `GET /api/proposals/:id` | Not wired |

The UI always labels illustrative evidence honestly. When Ashsmith’s APIs land, swap the implementations in `src/data/api.ts`; keep sending **ids only** from the client for metrics and proposal facts.

## Docs

- [Project plan](docs/MORROW_WHACK_2026_Project_Plan.md) — vision, demo flow, sponsors, and phase gates
- [Team plan](docs/team-plan.md) — four-person seat assignments and handoffs
- [Project context](docs/project-context.md) — short north-star brief for the team

## Seat

Accessible Interface — Caroline Hu
