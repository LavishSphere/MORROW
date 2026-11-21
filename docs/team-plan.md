# MORROW Whack 2026 — four-person work plan

This plan assigns the work in the [MORROW Whack 2026 project plan](MORROW_WHACK_2026_Project_Plan.md). It does not change that document. Every seat, deliverable, and handoff below comes from the capabilities, phases, and sponsor integrations that plan already describes.

## Roster

| Seat | Who | Main workstreams |
|---|---|---|
| AI, integrations, and data | **Ashsmith Khayrul** | OpenStreetMap and municipal data, evidence labels, Gemini drafting, Mastra, Tiger Data/PostGIS, the proposal API, optional Vultr |
| 3D Showcase | Name not assigned | Wellesley neighborhood scene, camera and lighting, intervention animation, route highlight |
| Accessible Interface | Name not assigned | Web app shell, Explore / Improve / Compare / Propose, keyboard and 2D access, proposal editor and PDF |
| Routing and Reliability | Name not assigned | Pedestrian routing and measured before/after results, static public demo, judge-flow rehearsal and backup |

The three unnamed seats stay identified by those role titles until real names exist. Ashsmith Khayrul's lane stays intact: AI, integrations, and data gathering are not split onto the other seats.

The project plan contains no hardware, device, or fabrication work. There is no hardware seat.

## The AI and machine-learning lane

The project plan is thin on machine learning. It specifies no training set, no fine-tune, no custom model, no model weights, and no learned classifier. The language-model work it does specify is server-side **Google Gemini** structured drafting, with **Mastra** as an optional workflow around that draft, and with schema validation of the model's JSON. Gemini and Mastra do not decide which place is inaccessible, and they do not produce route measurements.

That whole lane stays with Ashsmith Khayrul: prompts, model calls, output checks, the template used when the model is unavailable, and any later model work if the project adds some. Integrations stay there too: Gemini, Mastra, Tiger Data/PostGIS, Vultr, and the HTTP API. Gathering data stays there too: OpenStreetMap and Overpass, municipal open data, source attribution, evidence status, and the seeded barrier and proposal records.

## Ashsmith Khayrul — AI, integrations, and data

Ashsmith owns the facts the demo is allowed to state, the services that store and query those facts, and the only path that turns those facts into drafted prose.

### Datasets

- A small **Wellesley** extract from OpenStreetMap via Overpass: roads, building outlines, and tagged sidewalks where they exist, with provider attribution. The extract feeds the renderer and the street graph. It is a basemap, not a list of defects.
- A search of town and municipal open data and documented accessibility observations. Every imported issue keeps `source_title`, `source_url`, a timestamp when one exists, and an `evidence_status` of `verified`, `community_reported`, or `illustrative`.
- When a sourced local defect is not available, a few **illustrative** barrier records near the scene, marked illustrative in the data.
- The checked-in demo dataset the app uses when Tiger Data is unavailable, so the Wellesley scene and the route simulation still load.
- A phase-1 starter set, delivered early so the other seats can build: showcase bounding box, the GeoJSON, attribution text, shared TypeScript types (`Barrier`, `Intervention`, `EvidenceStatus`, `ProposalFacts`, `DraftProposal`), and one complete scenario (origin, destination, one barrier id, one intervention id, evidence status, `graphChanges`).
- Later cities (Cambridge, then Boston, then the wider list) only through this same pipeline, and only after the Wellesley demo is stable. The plan's launch priority is one Wellesley showcase.

### APIs and persistence

- The four endpoints in the project plan: `GET /api/barriers` by bounding box, `GET /api/barriers/:id`, `POST /api/proposals/generate`, and `GET /api/proposals/:id`.
- The generate endpoint accepts known `scenarioId`, `barrierId`, and `interventionId`, reloads canonical records, and recomputes modeled metrics with the routing module before any model call.
- Tiger Data / PostGIS as a P1 integration: the `barriers` and `proposals` tables, GiST index, parameterized bounding-box query, TLS `DATABASE_URL`, and saved drafts. The 3D scene still loads if the database is down.
- Vultr only as a P2 host for the API, and only when that deploy is reliable enough to leave the public judge demo intact.
- `GEMINI_API_KEY` and database credentials stay in Ashsmith's server environment.

### The model handoff

The plan includes no model file to hand over. The other seats receive model output only through `POST /api/proposals/generate`: a validated draft plus the trusted `facts` object, with `aiGenerated` and `warnings`. Gemini runs only after a location, an intervention, and routing results exist. The draft is structured JSON (headline, resident summary, rationale, municipal review request, talking points, limitations). Official measurements, evidence badges, and source links render from the server facts, including when a deterministic template fills the same shape because Gemini is unavailable.

Mastra, if it ships, is a typed multi-step workflow on this same path: validate, load evidence, collect route metrics, generate, check, and return the proposal. It is P1. It is dropped before the core demo is dropped.

### Phase gates Ashsmith owns

| Phase | Deliverable | Gate |
|---|---|---|
| 1. Foundation | Wellesley starter set and shared types | Other seats can build against real ids and footprints |
| 2. Actual usefulness | Stable ids and `graphChanges` for the one intervention | Routing can change a real edge on Ashsmith's graph |
| 3. Civic action | Generate endpoint, Gemini draft, template fallback | A proposal still exports when Gemini is unavailable |
| 6. Optional sponsor depth | Mastra, then live PostGIS, then Vultr, in that order | Each claimed sponsor is a live part of the demo |

Phase 4 polish and phase 5 rehearsal are led by other seats. Ashsmith joins phase 5 for the outage drill: database down and Gemini down, with the bundled dataset and the template still producing an honest proposal.

## 3D Showcase

This seat owns the flagship picture: a fast, miniature Wellesley neighborhood in the browser, built with React Three Fiber / Three.js on Ashsmith's footprints and coordinates.

### Deliverables

- Opening scene with "Make tomorrow possible," then a camera descent into the small Wellesley showcase.
- Miniature-world atmosphere: buildings, gentle lighting, atmospheric depth, subtle motion, and elegant camera moves. A judge can see what is clickable and what just changed.
- The accessible route drawn in light from the geometry Routing and Reliability returns.
- At least one intervention that visibly changes the street, ramp, path, or crossing. P1 adds a smooth transformation, a camera close-up, and a route redraw. Further intervention types get animation after the first one is solid.
- Picking inside the canvas. Selected barrier and intervention ids go to the app. The surrounding chrome belongs to Accessible Interface.
- Reduced-motion behavior in the scene when that mode is on.
- A renderer that can accept another location's geometry later. Cambridge or Boston scenery waits until Wellesley is polished and Ashsmith has delivered that city's data.
- Geographic form comes from the OpenStreetMap extract. The craft is the showcase treatment of those footprints. The scene follows the plan's rule against rebuilding proprietary map imagery as the model.

### Hands back

A canvas component that takes the GeoJSON, the barrier list, the selected ids, the route geometry, and the reduced-motion flag, and emits barrier and intervention selections. For the phase-2 intervention, the neighborhood changes on screen because the graph changed.

## Accessible Interface

This seat owns the public web application around the canvas: React and TypeScript, Vite or Next.js, Zustand or component state. Record the choice in the README. The app is public: no login and no judge credential.

### Deliverables

- Full-bleed canvas, a compact Wellesley location selector, and a bottom toolbar: **Explore | Improve | Compare | Propose**.
- Context panel for the selected barrier, its evidence source, the change options, and the calculated outcomes.
- Explore loads nearby barriers from `GET /api/barriers`, or from the bundled dataset when that API is marked unavailable. Improve applies an intervention by id. Compare shows before/after distance, reachability, and route from the routing result. Propose calls generate and shows an editable draft.
- The client sends ids only. Meters, evidence labels, and proposal prose that the PDF treats as official come back from the server.
- A before/after comparison. The plan's split view ships when it does not put the single-path compare at risk.
- Proposal screen and **Export PDF** (print styles or a client-side PDF). The document includes the seven sections in the project plan: location, issue, evidence, suggested intervention, modeled outcome, action requested, and next steps. Metrics, evidence status, and source links render from the validated `facts` object. The resident can edit the draft. Export works when the payload is the template (`aiGenerated` false).
- Keyboard operation, high-contrast labels, a reduced-motion control, and a functional 2D alternative. A MapLibre 2D map/list is the P1 expansion of that alternative.
- Status on every surface — verified, community-reported, or illustrative — using the value Ashsmith stored. Tiger Data and Gemini outages are labeled as unavailable.
- Location-selector entries for other cities wait until those cities are actually supported.

### Hands back

The production front-end build, the four-mode flow, the PDF, and a keyboard path through the same 90-second story. Empty and failure states ship in that build.

## Routing and Reliability

This seat owns the calculation that makes an intervention true, and the operational gate that makes the demo submittable. The graph stays small, as the plan describes: edge lengths, wheelchair-accessibility constraints, and Dijkstra or A*.

### Deliverables

- A weighted walkable graph built from Ashsmith's Wellesley extract and the intervention `graphChanges`. This seat does not collect OpenStreetMap data and does not assign evidence labels.
- The accessible shortest path before a change and after it. Compare modeled distance and route geometry. At P1, add a reachable-destination count across more than one destination.
- One complete scenario and one intervention that edits edges. Tests fail if the before/after figures are constants.
- A pure module the generate endpoint calls on the server, and that the browser calls for the live preview. The same path runs on the bundled dataset when Tiger Data is down.
- Results shipped as modeled impact, with the scenario's assumption list (demonstration graph, no site inspection, no engineering claim).
- Static HTTPS hosting for the front end. This host is the plan's reliable static host. Vultr stays on Ashsmith's seat. Phase 1 is done when a public URL opens the Wellesley scene reliably.
- Phase 5: several browsers, performance on an ordinary laptop, the keyboard path, a Gemini-down drill, a database-down drill, a timed pass of the 90-second pitch written in the project plan, and a backup recording plus screenshots.
- README runbook: how to open the demo and what the fallbacks do. Ashsmith writes the sponsor, data, and API section of that README.

Algorithm tests may use a synthetic graph. That fixture is not Wellesley data, and it does not ship in the judge build.

### Hands back

The routing module and its tests, the public URL, the phase-5 log, and the backup media. Ashsmith wires the module into `POST /api/proposals/generate` and calls Gemini only with metrics that module recomputed.

## Phases

| Phase | 3D Showcase | Accessible Interface | Routing and Reliability | Ashsmith Khayrul |
|---|---|---|---|---|
| 1. Foundation | Scene block-in on the published bounding box; lock the model to the GeoJSON when it lands | App shell, toolbar, no login, production build | Static host and public URL; algorithm running on the starter graph | Starter set: extract, attribution, types, one scenario |
| 2. Actual usefulness | Clickable barrier, route light, visible change for the one intervention | Scenario controls and Compare bound to engine output | Recomputed before/after for one trip and one intervention | Ids and `graphChanges` held stable |
| 3. Civic action | Keep the visual change stable while the proposal path lands | Editable draft and PDF from `facts`, including the template path | Server-callable engine returning geometry and meters | Generate endpoint, Gemini, template fallback |
| 4. Cinematic polish | Camera, lighting, transformation, route redraw | Micro-interactions that make the four modes obvious | Time the demo; fix hitches that break the 90 seconds | Keep the template path solid so polish does not depend on a live model |
| 5. Reliability | Laptop performance and reduced motion | Keyboard path, contrast, 2D alternative | Lead the test matrix, rehearsal, and backup recording | Outage behavior for Gemini and Tiger Data |
| 6. Optional depth | Second-city art only after Wellesley is done and the data exists | Keep rendering the same barrier and proposal payloads | Keep the static URL stable | Mastra, then live PostGIS, then Vultr |

The completion gates are the ones in the project plan. Phase 6 starts after an unfamiliar person can finish the Wellesley loop on the public URL.

## Dependencies

```text
Ashsmith starter set (bbox, GeoJSON, attribution, types, one scenario)
        |                 |                    |
        v                 v                    v
  3D Showcase     Routing module      Accessible Interface shell
                        |                    |
                        +---- Compare UI ----+
                        |
                        v
              Ashsmith generate endpoint
              (recompute, then Gemini or template)
                        |
                        v
              Proposal editor and PDF
                        |
                        v
              Public URL rehearsal and backup
```

- 3D Showcase and Routing and Reliability need the starter set before the judge-facing Wellesley scene and graph are real. Interface layout and the PDF sections can start from the shared types and from the proposal outline already written in the project plan.
- Export depends on the facts schema and the template. It does not wait on a live Gemini call.
- The 3D world and the routing demo load from the bundled dataset. They do not wait on Tiger Data.
- The public URL is the static host. It does not wait on Vultr.
- The public generate path depends on the routing module. Ashsmith can exercise the model call on fixture facts until that module is wired, and the judge-facing path uses the module's recomputed meters.
- Any city beyond Wellesley depends on Ashsmith's pipeline and on a finished Wellesley loop. Phases 1 through 5 do not depend on it.

## What each seat hands back to Ashsmith

| From | Artifact | Why Ashsmith needs it |
|---|---|---|
| Routing and Reliability | Pure routing module and tests | The generate endpoint recomputes before Gemini runs |
| Accessible Interface | A client that calls generate with ids only, and that can show template drafts and unavailable states | The API remains the authority, and fallbacks are visible |
| 3D Showcase | Selection events carrying barrier and intervention ids, and a scene that follows dataset coordinates | Spatial queries and saved proposals key off those ids |
| Routing and Reliability | Public URL, drill notes, and backup recording | A sponsor claim is made for a demo that has survived the outage drills |

## What Ashsmith hands the other seats

| Handoff | Goes to | Phase |
|---|---|---|
| Dataset: Wellesley GeoJSON, attribution, bounding box | 3D Showcase, Routing and Reliability | 1 |
| Dataset: barrier, intervention, evidence, sources, one scenario | All three | 1 |
| Types: `Barrier`, `Intervention`, `ProposalFacts`, `DraftProposal` | All three | 1 |
| API: barriers list, barrier by id, generate, proposal by id | Accessible Interface; Routing and Reliability supplies the recompute hook the generate endpoint calls | 2 for the contract, 3 for a live endpoint |
| Model output: validated draft plus trusted facts, or the same shape from the template | Accessible Interface | 3 |
| Bundled demo dataset for the outage path | 3D Showcase, Routing and Reliability, Accessible Interface | 3 |
| Live PostGIS records, and only when that integration is actually running | Accessible Interface, through the same barrier payload | 6 |

API keys, prompts, and database URLs stay on Ashsmith's server. They are not part of these handoffs.

## Balance across the three unnamed seats

Each unnamed seat owns one part of the demo the project plan treats as essential:

- **3D Showcase** owns the Wellesley scene and the visible transformation (the picture in phases 1, 2, and 4).
- **Accessible Interface** owns the judge-facing product and the takeaway document (the app throughout, and the proposal in phase 3).
- **Routing and Reliability** owns the two gates that decide whether the demo is real and ready: a calculated change (phase 2) and an unassisted, rehearsed, backed-up public demo (phases 1 and 5). The routing work is the plan's small graph algorithm. The reliability work starts in earnest once that algorithm is in place, so the seat stays occupied for the whole hackathon while data gathering and the model remain with Ashsmith.

Ashsmith's lane is the data pipeline plus the sponsor stack, kept whole. If the schedule slips, cut in the project plan's order, and keep the proposal and the route engine:

- 3D Showcase drops extra animation and any second city.
- Accessible Interface drops the split-screen compare and extra-city controls, and keeps one keyboard path, the facts-based PDF, and the four modes.
- Routing and Reliability drops multi-destination reachability (P1) and keeps a single computed before/after.
- Ashsmith drops Vultr, then Mastra, then live Tiger Data, and keeps the packaged dataset, Gemini as the first sponsor integration, and the template fallback. Wellesley data gathering stays. Other cities drop.

Every seat follows the plan's honesty rules: show evidence status, call results modeled, keep route math in the routing module, and describe an illustrative Wellesley scenario as a simulation.

## Done

The team can submit when the project plan's definition of done holds on the public URL:

- The link opens with no help (**Routing and Reliability**).
- The Wellesley scene makes the issue understandable (**3D Showcase**).
- A judge can apply at least one intervention (**Accessible Interface** with **3D Showcase**).
- Before/after results are computed (**Routing and Reliability**) from Ashsmith's scenario data.
- A credible proposal exports, including when Gemini is unavailable (**Ashsmith Khayrul** and **Accessible Interface**).
- The document is something a resident could bring to a local conversation: evidence and draft text from **Ashsmith Khayrul**, measured outcome from **Routing and Reliability**, and the exported artifact from **Accessible Interface**.
