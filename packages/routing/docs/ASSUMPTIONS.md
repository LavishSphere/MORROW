# Routing model assumptions

MORROW’s pedestrian router reports **modeled impact**, not surveyed truth.

## What this module does

- Builds a weighted walkable graph (edge lengths + wheelchair-accessibility flags).
- Finds an accessible shortest path with A* (Dijkstra-equivalent when the heuristic is dominated).
- Applies an intervention’s `graphChanges` and recomputes the path.
- Returns before/after meters, node/edge ids, and route geometry for Compare UI and `ProposalFacts`.

## What this module does **not** claim

- No site inspection, ADA survey, or engineering feasibility assessment.
- No assertion that a Wellesley (or any) curb, crossing, or path is actually deficient.
- No guarantee that installing a ramp would produce the modeled meters in the real world.
- Synthetic fixtures are **not** Wellesley geography and must not be presented as the judge-facing map extract.

## Demo / data sources

| Source | Role |
|---|---|
| `syntheticDemoScenario` | Unit tests and local algorithm checks only |
| Future starter-data GeoJSON | Plug in via `graphFromWalkableGeoJson` once Ashsmith’s extract lands |
| Tiger Data barriers | Evidence labels only — routing never invents evidence status |

## Honesty copy shipped with results

`DEFAULT_MODEL_ASSUMPTIONS` (and any scenario-specific extras) must travel with before/after metrics into proposals and the UI. Prefer the phrase **modeled impact**.
