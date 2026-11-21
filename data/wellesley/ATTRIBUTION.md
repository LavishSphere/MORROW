# Wellesley showcase data — attribution

## OpenStreetMap basemap

- **File:** [`basemap.geojson`](./basemap.geojson)
- **Source:** [OpenStreetMap](https://www.openstreetmap.org/) via the [Overpass API](https://overpass-api.de/)
- **License:** [Open Data Commons Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/)
- **Required credit:** © OpenStreetMap contributors — [copyright notice](https://www.openstreetmap.org/copyright)
- **Extract:** Roads, building outlines, footways/paths, and tagged sidewalks inside the showcase bbox in [`bbox.json`](./bbox.json) (near Wellesley College: Central Street / College Road).
- **Extract timestamp:** See `properties.extractedAt` on the GeoJSON FeatureCollection.

Basemap geometries power the 3D renderer and the pedestrian graph. They are **not** a barrier inventory. A missing accessibility tag in OSM is **not** proof that a place is inaccessible.

## Illustrative barriers

The barrier and intervention in [`demo-dataset.json`](./demo-dataset.json) are **illustrative** (`evidenceStatus: "illustrative"`). They exist so other seats can build against stable ids. Do not present them as verified defects at Wellesley College.

When a future import uses municipal open data or documented observations, preserve `sourceTitle`, `sourceUrl`, `observedAt`, and a defensible `evidenceStatus` of `verified` or `community_reported`.

## Honesty labels (UI / PDF)

| Surface | Required language |
|---|---|
| Basemap | OSM attribution; footprints only |
| Barrier badge | Show `evidenceStatus` exactly (`verified` / `community_reported` / `illustrative`) |
| Route compare | Label results as **modeled** impact |
| Proposal export | Keep evidence status and assumptions from trusted facts — not from model prose |
