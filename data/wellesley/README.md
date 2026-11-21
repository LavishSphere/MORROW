# Wellesley Phase-1 starter set

Offline bundle for the MORROW flagship showcase near Wellesley College.

## Paths

| Path | What it is |
|---|---|
| [`bbox.json`](./bbox.json) | Showcase bounding box (WGS84) |
| [`basemap.geojson`](./basemap.geojson) | OSM roads, buildings, footways/paths, tagged sidewalks |
| [`demo-dataset.json`](./demo-dataset.json) | Barriers, intervention, one complete scenario, honesty labels |
| [`ATTRIBUTION.md`](./ATTRIBUTION.md) | ODbL credit and honesty rules |

Shared TypeScript types live in [`../../shared/types.ts`](../../shared/types.ts).

## How other seats consume this

### 3D Showcase

1. Load `bbox.json` for camera framing / clip bounds (`center`, `west/south/east/north`).
2. Render `basemap.geojson` FeatureCollection. Use `properties.layer`: `building` | `road` | `footway` | `path` | `sidewalk`.
3. Place the barrier marker from `demo-dataset.json` → `barriers[0].coordinates`.
4. On intervention select, animate using `interventions[0].id` / `graphChanges` edge ids (`properties.edgeId` on basemap features).

### Routing and Reliability

1. Build a walkable graph from basemap line features (`edgeId`, geometry length as weight). Treat edges as inaccessible until tagged or unlocked by an intervention.
2. Run before/after on `scenario.origin` → `scenario.destination`.
3. Apply `scenario.graphChanges` (same payload as the intervention) so the after-path can use `osm-way-543827744` and `osm-way-543827745`.
4. Return modeled meters and route geometry — never hard-code compare results.

### Accessible Interface

1. Import types from `shared/` (`Barrier`, `Intervention`, `EvidenceStatus`, `ProposalFacts`, `DraftProposal`).
2. When the API / Tiger Data is down, load `demo-dataset.json` and show the honesty strings under `honesty`.
3. Always render `evidenceStatus` on barrier chrome and PDF facts. This scenario is **`illustrative`**.
4. Send **ids only** to generate (`scenarioId`, `barrierId`, `interventionId`); trust server facts for meters and badges.

## Stable ids (do not rename without coordinating)

- Scenario: `wellesley-demo-01`
- Barrier: `wellesley-barrier-campus-path-01`
- Intervention: `wellesley-intervention-ramp-01`
- Graph edges unlocked by the intervention: `osm-way-543827744`, `osm-way-543827745`
