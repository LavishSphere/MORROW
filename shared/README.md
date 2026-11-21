# Shared types

Phase-1 TypeScript contracts for all MORROW seats.

- [`types.ts`](./types.ts) — `EvidenceStatus`, `Barrier`, `Intervention`, `ProposalFacts`, `DraftProposal`, plus `DemoScenario` / `DemoDataset`
- [`index.ts`](./index.ts) — re-exports

Import from here once the app package lands, for example:

```ts
import type { Barrier, DemoDataset, ProposalFacts } from '../shared';
```

Pair with the offline Wellesley bundle at [`data/wellesley/demo-dataset.json`](../data/wellesley/demo-dataset.json).
