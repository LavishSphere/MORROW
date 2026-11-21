# `@morrow/routing`

Pure TypeScript pedestrian routing for MORROW (browser + server).

## Install / run

```bash
cd packages/routing
npm install
npm test
npm run build
```

## Public API

```ts
import {
  compareScenario,
  compareBeforeAfter,
  findShortestPath,
  applyGraphChanges,
  graphFromWalkableGeoJson,
  toModeledRouteMetrics,
  syntheticDemoScenario,
  DEFAULT_MODEL_ASSUMPTIONS,
} from "@morrow/routing";

const comparison = compareScenario(syntheticDemoScenario);
const metrics = toModeledRouteMetrics(comparison);
// metrics.beforeMeters / afterMeters — recomputed, not hard-coded UI constants
```

### Future Wellesley GeoJSON

When starter-data LineStrings land:

```ts
const graph = graphFromWalkableGeoJson({ edges: wellesleyFeatureCollection });
const comparison = compareBeforeAfter({
  scenarioId: "wellesley-demo-01",
  interventionId: "…",
  graph,
  query: { originId, destinationId, requireWheelchairAccessible: true },
  graphChanges: intervention.graphChanges,
});
```

## Out of scope here

UI shell, 3D, Gemini, deployment, evidence labeling.

See [docs/ASSUMPTIONS.md](./docs/ASSUMPTIONS.md).
