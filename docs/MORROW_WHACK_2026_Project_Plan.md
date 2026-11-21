# MORROW
### Make tomorrow possible.

**WHACK 2026 | Better Worlds (Social Impact) | Project Brief + Sponsor Integration Plan**

> Help anyone visualize a more accessible neighborhood and turn an idea for improvement into a concrete proposal for local decision-makers.

**Primary objective:** Build a first-place-caliber, highly interactive hackathon demo with a compelling visual identity, a meaningful social-impact use case, and a credible, actionable output.

**Flagship location:** **Wellesley, Massachusetts**, especially an intentionally small, recognizable area near Wellesley College. This is a showcase location, not a claim that specific accessibility barriers exist there.

---

## 1. Vision

MORROW is an interactive civic-planning experience that lets residents, advocates, and local planners explore a neighborhood, identify accessibility barriers, test potential improvements, and create shareable proposals for local government.

It should feel like entering a living miniature city: elegant buildings, gentle lighting, moving people, smooth camera motion, and infrastructure that visibly transforms when the user suggests a change.

But the visuals serve a real purpose: make urban accessibility issues understandable to people without urban-planning expertise.

**One-line pitch:** *What if improving your neighborhood were as intuitive as interacting with it?*

**Central promise:** Discover a problem → visualize a change → understand the effect → advocate for action.

## 2. Why this fits Better Worlds

The track's challenge is to **“turn hopeful visions into meaningful change for communities around the world.”** MORROW should directly address that in three ways:

1. **Accessibility and equity:** Show how barriers in walking and wheelchair-accessible routes can limit access to community destinations.
2. **Community participation:** Let residents explore proposed fixes without specialized GIS or engineering software.
3. **Practical advocacy:** Create a concise, location-specific proposal residents can bring to a city department, public meeting, or local advocacy group.

The hackathon prototype will **not** claim to repair infrastructure or guarantee municipal action. Its value is helping people understand, communicate, and propose better solutions.

## 3. The experience judges should have

**Target: a memorable, fully hands-on 90-second demonstration.**

1. **Arrival:** Open MORROW and see a gorgeous, responsive 3D neighborhood. The opening scene says “Make tomorrow possible.”
2. **Choose a place:** Select the **Wellesley showcase**, with a camera descent into a small, polished environment near campus.
3. **Explore a journey:** Choose a resident scenario, such as a wheelchair user traveling to a public destination. The accessible route is highlighted in light, and an identified or clearly labeled example barrier is shown.
4. **Intervene:** Click a candidate improvement, such as adding a curb ramp or an accessible crossing. The neighborhood physically changes through an animated transformation.
5. **See the result:** Watch the route update. Compare **before / after** travel distance and reachable destinations computed from the demonstration's underlying graph.
6. **Take action:** Click **Generate Proposal** to produce a polished advocacy brief with a map, location, issue description, suggested intervention, evidence status, calculated impact, and a letter or meeting talking points.

**Final emotional beat:** The judge just went from seeing a barrier to holding a useful proposal for improving a neighborhood.

## 4. Visual direction

### Design principles

- **Beautiful enough to stop someone walking past the booth.** Aim for VITRA's cinematic impact, with deeper direct interaction.
- **Miniature-world atmosphere.** Calm, tactile 3D geometry with subtle animation, warm and cool light, atmospheric depth, elegant camera movement.
- **Clarity above decoration.** A judge should immediately understand what can be clicked and what changed.
- **Transformation as the centerpiece.** Streets, ramps, paths, and route highlights should react visibly when a change is selected.
- **Accessible interface.** Keyboard-operable controls, high-contrast labels, reduced-motion mode, and a functional 2D alternative to 3D manipulation.

### Proposed UI

- Full-bleed 3D neighborhood canvas.
- Compact floating location selector: **Wellesley (featured)**, with later destinations as supported.
- Clean, unobtrusive bottom toolbar: **Explore | Improve | Compare | Propose**.
- Context panel showing selected barrier, evidence source, change options, and calculated outcomes.
- Split-screen or draggable before/after comparison, if feasible without compromising core functionality.
- Proposal view styled like a professional civic briefing, with a prominent **Export PDF** button.

## 5. City strategy: one exceptional showcase, scalable architecture

### Launch priorities

| Priority | Location | Delivery expectation |
|---|---|---|
| P0 | **Wellesley, MA** | One compact, meticulously crafted 3D showcase with a complete interactive flow. |
| P1 | **Cambridge, MA** | Optional second example if data integration and core functionality are stable. |
| P2 | **Boston, MA** | Additional example only after the Wellesley flow is fully polished. |
| Later | Medford, SF, LA, NYC, DC, Austin, and others | Explore through a reusable map-data pipeline, without promising full fidelity everywhere. |

### Why not hand-build ten cities?

A broad, unfinished experience is less persuasive than one exceptional demonstration. Build the renderer and routing model so they *could* accept other locations, but only advertise capabilities that have been implemented and tested.

### Ground truth and data policy

- Use **OpenStreetMap** and a suitable open-data-friendly rendering pipeline for geographic basemaps, subject to provider licensing and attribution.
- Look for **municipal open-data** sources and verified accessibility observations when possible.
- Distinguish **verified barrier**, **community-reported barrier**, and **illustrative / hypothetical scenario** in the UI and proposal.
- Do **not** claim that a particular Wellesley street or intersection has a defect unless the source supports it.
- A map's missing accessibility tag is **not** proof of an inaccessible location.
- Avoid treating a Google Maps view as freely extractable 3D geometry or copying proprietary map content into an independent model.

## 6. Core capabilities

### Must ship (P0)

- [ ] Public demo URL; no private token, login, or special judge credentials.
- [ ] A beautiful, fast Wellesley neighborhood scene that works on an ordinary laptop browser.
- [ ] Intuitive click/tap selection for a route and an intervention.
- [ ] At least **one** complete accessibility scenario, clearly indicating whether it is real or illustrative.
- [ ] At least **one** functioning infrastructure intervention that changes a route graph.
- [ ] Measurable before/after comparison computed in code, not hard-coded as a result of button clicks.
- [ ] A location-specific, printable or downloadable advocacy proposal.
- [ ] **Gemini-powered drafting** from a validated, structured evidence-and-routing payload; deterministic template fallback if AI is unavailable.
- [ ] Clear data attribution and honest assumptions.
- [ ] A polished 90-second judge walkthrough and backup recording/screenshots in case of connectivity problems.

### Strong additions (P1)

- [ ] Three intervention types, e.g., curb ramp, improved crossing, accessible connector path.
- [ ] Smooth animated transformation, camera close-up, and route-redraw effects.
- [ ] Multiple destinations and a reachability count in addition to route length.
- [ ] A simple 2D map/list mode with keyboard controls.
- [ ] A second grounded city example, likely Cambridge.
- [ ] **Mastra proposal workflow** that sequences evidence checking, route-result collection, Gemini drafting, validation, and export.
- [ ] **Tiger Data/PostGIS** persistence for barriers and proposals once the local Wellesley demo is stable.

### Stretch goals (P2)

- [ ] Any-city search backed by a tested OSM/municipal-data loader.
- [ ] Community-submitted reports with review/moderation.
- [ ] Public sharing of verified proposals.
- [ ] City-official workflow, cost estimates from actual unit-cost sources, or advanced scenario comparisons.
- [ ] **Vultr** API deployment only if it is straightforward and reliable enough to leave the public judge demo unaffected.

**Explicitly out of scope for the first 24 hours:** detailed digital twins for every city, citywide ground-truth audits, automatically verified construction cost estimates, and any suggestion that MORROW has governmental authority to approve infrastructure changes.

## 7. Proposed technical architecture

| Layer | Suggested tools | Purpose |
|---|---|---|
| Front end | React + TypeScript + Vite or Next.js | Public interactive web application. |
| 3D showcase | React Three Fiber / Three.js | Cinematic neighborhood, lighting, picking, and intervention animations. |
| Geographic map/data | OpenStreetMap + GeoJSON; MapLibre if 2D map is needed | Streets, geographic context, and reusable location data. |
| Routing engine | Small weighted pedestrian graph; Dijkstra or A* | Recalculate accessible trips when edges or barriers change. |
| State | Zustand or React state | Location, scenario, intervention, comparison, and UI state. |
| AI writing | **Google Gemini API** (server-side) | Draft human-readable advocacy text from validated, structured facts; never calculate route metrics. |
| Workflow orchestration | **Mastra** (P1) | Repeatable steps for validation, metrics, generation, review, and export. |
| Spatial persistence | **Tiger Data PostgreSQL + PostGIS** (P1) | Store geolocated barriers, sources, statuses, and proposals; query by neighborhood. |
| Proposal export | Browser print styles or client-side PDF generation | Location-specific advocacy brief, with an AI-generated or template-generated narrative. |
| Deployment | Reliable static frontend host; **Vultr** optional backend | Public, judge-accessible HTTPS demo; do not introduce a brittle single point of failure. |

### Data model, simplified

```ts
type EvidenceStatus = 'verified' | 'community_reported' | 'illustrative';

type Barrier = {
  id: string;
  coordinates: [number, number];
  type: 'missing_ramp' | 'unsafe_crossing' | 'blocked_path';
  evidenceStatus: EvidenceStatus;
  source?: string;
  description: string;
};

type Intervention = {
  id: string;
  barrierId: string;
  type: 'install_ramp' | 'improve_crossing' | 'connect_path';
  description: string;
  graphChanges: Array<{
    edgeId: string;
    accessible: boolean;
    weight?: number;
  }>;
};
```

### Core interaction logic

1. Define a walkable street/path graph with edge lengths and wheelchair-accessibility constraints.
2. Compute the accessible shortest path before an improvement.
3. Let a user apply an intervention, modifying selected edges or constraints.
4. Compute the path again and compare **actual modeled** distances, reachability, and route geometry.
5. Present the change as **modeled impact**, not as a claim of real-world infrastructure improvement.
6. Put location, assumptions, and evidence status into the generated proposal.

## 8. Sponsor integration strategy (verified against the MLH WHACK prize page, November 21, 2026)

The [official WHACK sponsor prize page](https://www.mlh.com/events/whack-wellesley-hackathon/prizes) lists **Best Use of Gemini API**, **Best Use of Mastra**, **Best Use of Tiger Data**, and **Best Use of Vultr**. These are distinct MLH sponsor challenges; using a technology does **not** guarantee eligibility, a sponsor win, or a track-level first-place award. Read current submission requirements and show real usage in the code and demo. The **Better Worlds first-place objective always takes precedence** over sponsor prize chasing.

### Sponsor priorities

| Priority | Sponsor / challenge | Concrete role in MORROW | Proof of real integration | Cut rule |
|---|---|---|---|---|
| **P0** | **Google Gemini API** / Best Use of Gemini API | Draft the civic-impact explanation, request for municipal review, and accessible summary *after* code supplies evidence status and routing results. | Judge edits an intervention and generates a distinct proposal with verified structured inputs; server logs or a development trace show a genuine API call. | Keep the route engine independent; provide a safe template fallback if the API fails. |
| **P1** | **Mastra** / Best Use of Mastra | Coordinate a real workflow: validate scenario → load evidence → compute/collect route metrics → generate with Gemini → inspect/return a structured proposal. | Demonstrate a Mastra workflow with distinct typed steps and an observable result; not just a dependency in package.json. | Skip if it slows the core demonstration or introduces runtime fragility. |
| **P1** | **Tiger Data** / Best Use of Tiger Data | Use cloud PostgreSQL with PostGIS for geolocated accessibility observations and saved draft proposals. | A live spatial query retrieves actual seeded/attributed barrier records within the Wellesley demo area, with evidence status shown. | Use packaged JSON/GeoJSON for the demo if the database isn't reliable; don't misrepresent static files as Tiger Data usage. |
| **P2** | **Vultr** / Best Use of Vultr | Host the API/workflow service if deployment can be completed and tested without sacrificing UX. | Public HTTPS frontend successfully calls a backend that is genuinely running on Vultr. | Do not migrate a stable deployment merely to add another sponsor. |

Other categories on the prize page include **Best Use of Solana**, **Best Domain Name from GoDaddy Registry**, the **DEV Writing Challenge**, and a **SpaceXSI/Cursor/Grok Bot raffle**. None is essential to MORROW's civic-use case. In particular, do not add a blockchain ledger solely for prize eligibility. A polished domain or post-event article can be pursued only after submission is safe and the main demo works.

### Proposed AI/agent experience: "Turn this improvement into action"

The judge modifies a crossing in the 3D Wellesley scene and clicks **Create community proposal**.

1. **Deterministic first:** The routing engine computes the original and modified accessible routes (distance and/or reachable destinations). It also supplies the selected barrier ID, source attribution, evidence status, and specific proposed change.
2. **Mastra workflow (if integrated):** Validate input and sources, assemble a bounded `ProposalFacts` object, call Gemini for clear prose, validate returned fields, and pass the result to the proposal renderer. Use explicit, auditable steps instead of a broad autonomous agent.
3. **Gemini contribution:** Generate a compelling but cautious title, resident-readable explanation, concise municipal review request, and public-meeting talking points. Use structured output, avoiding invented measurements, agencies, engineering claims, costs, or citations.
4. **Human review:** Show the draft before export with the ability to edit it. The user can export a useful PDF even without Gemini through deterministic template copy.
5. **Observable reveal:** The judge sees a transformed route and a personalized civic proposal based on the *intervention they selected*, not a static prewritten letter.

**Non-negotiable boundary:** Gemini and Mastra must **not** decide which sidewalk is truly inaccessible or invent before/after figures. Only validated source data and routing code determine those facts. When the scenario is illustrative, the generated text must explicitly identify it as a simulation and must not allege an actual defect at Wellesley College.

### Minimal data contract for the AI layer

```ts
type ProposalFacts = {
  city: string;
  locationLabel: string;
  evidenceStatus: 'verified' | 'community_reported' | 'illustrative';
  evidenceSources: { title: string; url?: string; observedAt?: string }[];
  barrierType: string;
  intervention: string;
  beforeMeters: number | null;
  afterMeters: number | null;
  newlyReachableDestinations: number | null;
  modelAssumptions: string[];
};

type DraftProposal = {
  headline: string;
  plainLanguageSummary: string;
  requestForReview: string;
  meetingTalkingPoints: string[];
  limitations: string;
};
```

The server should validate both objects using a schema library (for example Zod), use server-side environment variables for API keys, limit input size, rate-limit public requests, and reject or remove generated details not supported by `ProposalFacts`. Treat generated prose as **draft text**, not verified civic or engineering guidance.

### Tiger Data schema / interaction, if time allows

- `barriers(id, location geometry(Point, 4326), type, evidence_status, source_url, description, updated_at)`
- `proposals(id, barrier_id, intervention_type, modeled_before_m, modeled_after_m, draft_json, created_at)`
- Index `barriers.location` with GiST; retrieve records inside the demo bounding box through a bounded PostGIS query.
- Seed only clearly sourced records and explicitly labeled illustrative examples. A database record is not itself evidence that the barrier is real.
- Do **not** make a live database dependency a requirement for loading the flagship 3D world; keep a baked-in demo scene and routing graph available if the database connection fails.

### Deployment and proof checklist

- [ ] Gemini calls run on a server, never exposing `GEMINI_API_KEY` to browsers.
- [ ] Real Gemini output is visibly based on the judge-selected scenario and validated modeled metrics.
- [ ] Mastra, if claimed, executes a typed multi-step workflow rather than merely wrapping a single function.
- [ ] Tiger Data, if claimed, is queried live for a meaningful spatial feature, and citations/evidence labels survive through export.
- [ ] Vultr, if claimed, actually serves a working production endpoint used in the public demo.
- [ ] README and submission list exact sponsors used, configuration, relevant files/endpoints, and what each improves for residents.
- [ ] Demo has safe local/template fallback for API quotas, network issues, and sponsor backend outages.

**References:** [MLH sponsor challenges](https://www.mlh.com/events/whack-wellesley-hackathon/prizes) · [Gemini API documentation](https://ai.google.dev/gemini-api/docs) · [Mastra workflow docs](https://mastra.ai/docs/workflows/control-flow) · [Tiger Data/PostGIS example](https://www.tigerdata.com/docs/learn/tutorials/analyze-transport-data) · [Vultr documentation](https://docs.vultr.com/).

## 8A. Concrete build plan: Gemini API + Tiger Data

**Intended integration:** These are not sponsor logos added to a slide. A judge's real interaction should invoke **Tiger Data to load localized accessibility observations**, then invoke **Gemini to write a proposal constrained by real records and the routing engine's modeled results**. Every step should be inspectable in our API logs and reproducible in the public demo.

### A. What each sponsor actually does

| Product | Job in MORROW | Judge-visible outcome | What it must NOT do |
|---|---|---|---|
| **Tiger Data (Tiger Cloud PostgreSQL + PostGIS)** | Persist sourced barriers/community reports and saved proposals. Run spatial queries to find observations in the selected area or close to the judge's clicked point. | Clicking a Wellesley intersection loads nearby observations with evidence badges, dates, and source links. A generated proposal can be saved and revisited. | It is not a source of truth by itself, a map imagery provider, or the algorithm that decides routes. |
| **Google Gemini API** | Convert a **server-validated** selection, source details, and computed before/after metrics into plain-language issue summaries, municipal review requests, speaking points, and optionally a shorter accessible explanation. | After the judge fixes a crossing, the proposal visibly refers to **that crossing, that intervention, and that calculated change**. | It must not invent barriers, estimate engineering costs, manufacture authorities/citations, compute route lengths, or label hypothetical data verified. |

**Illustrative story:** A judge clicks a crossing by the Wellesley showcase. Tiger Data returns a record tagged **illustrative scenario** unless a supporting real source exists. The judge enables a proposed curb ramp. The route engine recomputes the path from the same origin to destination. Gemini then prepares a cautious proposal explaining the *modeled* route improvement and requesting an on-site assessment. The generated PDF includes the record's evidence label and source metadata.

### B. End-to-end request flow

```text
OSM/GeoJSON + official sources (preprocessed and credited)
               |                      |
               | geometry/paths       | verified or illustrative observations
               v                      v
    Bundled Wellesley graph       Tiger Cloud PostgreSQL
    + polished 3D geometry         + PostGIS spatial index
               |                      |
               +---- React / R3F scene +---- GET /api/barriers?bbox=...
                               |
                      Judge selects barrier
                      + proposed intervention
                               |
                       POST /api/proposals/generate
                               |
                         Server validates IDs
                         and reloads trusted facts
                               |
                     Deterministic graph routing
                      (before and after meters)
                               |
                  Gemini structured draft generation
                               |
                    Validate output and add fixed
                    evidence/metric/source sections
                               |
                    Save draft to Tiger Data
                               |
                    Return editable proposal JSON
                               |
                  Judge reviews and exports PDF
```

**Trust rule:** Do not treat numbers or evidence labels sent by a browser as authoritative. The API should accept a known `scenarioId`, `barrierId`, and `interventionId`, then load the canonical records and recompute the modeled metrics (or verify them against a trusted server-side scenario definition) before calling Gemini. A public user must not be able to submit arbitrary claims that become official-looking documents.

### C. Tiger Data implementation

**Why Tiger Data:** Geospatial filtering is central to the product. PostGIS lets MORROW ask “which reported issues fall inside this neighborhood?” without hand-maintaining city-specific lists. Tiger Cloud supports a standard PostgreSQL connection and PostGIS extension; start with ordinary relational tables, not unnecessary TimescaleDB hypertables. Add time-series analytics only if a genuine time-based use case emerges.

**Minimal SQL migration:**

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS barriers (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  location GEOMETRY(Point, 4326) NOT NULL,
  barrier_type TEXT NOT NULL,
  evidence_status TEXT NOT NULL CHECK (
    evidence_status IN ('verified', 'community_reported', 'illustrative')
  ),
  description TEXT NOT NULL,
  source_title TEXT,
  source_url TEXT,
  observed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS barriers_location_gist
  ON barriers USING GIST (location);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY,
  barrier_id TEXT NOT NULL REFERENCES barriers(id),
  scenario_id TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  before_m DOUBLE PRECISION,
  after_m DOUBLE PRECISION,
  facts JSONB NOT NULL,
  draft JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Example real spatial query, called by the backend with validated, parameterized WGS84 bounds:**

```sql
SELECT id, city, barrier_type, evidence_status, description,
       source_title, source_url, observed_at,
       ST_X(location) AS longitude, ST_Y(location) AS latitude
FROM barriers
WHERE ST_Intersects(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))
ORDER BY updated_at DESC
LIMIT 100;
-- $1 = west longitude, $2 = south latitude,
-- $3 = east longitude, $4 = north latitude
```

**Seed/import strategy:**

1. Use OpenStreetMap/Overpass to prepare roads, building outlines, and (where tagged) sidewalks for the selected **small** Wellesley neighborhood. These power the renderer and underlying graph, **not** the barrier truth labels.
2. Investigate town/municipal open-data and documented accessibility observations. For every actual imported issue, preserve `source_title`, `source_url`, timestamp (when known), and a defensible `evidence_status`.
3. If no verified localized defects are found, insert a few **explicitly illustrative** barrier records near the scene, clearly distinguished in both the UI and exported documents. Never claim a seeded illustration represents a real defect.
4. Connect backend with `DATABASE_URL` over TLS. Expose read-only, capped spatial queries through server endpoints, not direct browser database credentials.
5. A saved proposal is evidence of the *user's modeled idea*, **not** proof that a city adopted, approved, or implemented an improvement.

**Judge demonstration of Tiger Data:** Pan to a different subsection of the neighborhood: the barrier list updates based on the actual PostGIS query. Select a record and inspect its provenance. Generate and save a proposal, then open its saved draft by ID. This is meaningfully stronger than using the database only as storage for a prewritten script.

### D. Gemini implementation

**When Gemini runs:** Only **after** a judge has picked a location, applied an intervention, and received route results from our code. The model receives a small validated facts object, not unrestricted web content or unverified claims.

**Input (representative, values shown for schema illustration only):**

```json
{
  "scenarioId": "wellesley-demo-01",
  "city": "Wellesley, MA",
  "locationLabel": "Wellesley showcase crossing",
  "barrierId": "example-crossing-01",
  "evidenceStatus": "illustrative",
  "sources": [],
  "intervention": "Add an accessible curb connection",
  "modeledRoute": {
    "beforeMeters": 620,
    "afterMeters": 410,
    "unit": "meters"
  },
  "assumptions": [
    "Demonstration-only street graph",
    "No site inspection or engineering feasibility assessment"
  ]
}
```

*The numbers above are hypothetical examples for API design and are not measurements of Wellesley.* Actual demo outputs come from routing code.

**Prompt contract:** “Write an editable community advocacy proposal using **only** the supplied facts. State that results are modeled, retain the evidence status, and ask officials to assess feasibility. Do not invent real accessibility defects, agency names, source links, cost estimates, construction timelines, or outcome figures. Return only the requested JSON fields.”

**Expected structured output:**

```ts
type GeminiProposalDraft = {
  headline: string;
  residentSummary: string;          // accessible, non-technical explanation
  rationale: string;                // why the proposed change is worth reviewing
  municipalReviewRequest: string;   // precise, respectful request for evaluation
  meetingTalkingPoints: string[];  // 2-4 concise points
  limitations: string;             // explicitly preserves simulation/verification caveats
};
```

**Implementation choices:** Use Google's maintained `@google/genai` SDK on the server with a supported Gemini model and **structured JSON output**; validate the response with Zod. A model's JSON schema compliance does not guarantee factual correctness, so render the location, metrics, evidence badge, and actual sources **directly from trusted server data**, not from Gemini's prose. The generated body remains an editable draft. Default to concise, persuasive language suitable for a town meeting, not technical or legal conclusions.

**Reliability and safety:** Set bounded output tokens/latency, request throttling, and a small usage budget. Store `GEMINI_API_KEY` server-side only. If the call fails or violates validation, return a readable template generated from the same verified facts. No unrestricted browsing and no automated messages to municipal officials; the resident decides whether and where to submit the proposal.

### E. API contract and frontend wiring

| Endpoint | Behavior | Response |
|---|---|---|
| `GET /api/barriers?bbox=west,south,east,north` | Validate bounds; query Tiger Data/PostGIS with a row limit; attach source/evidence metadata. | `Barrier[]`, normalized to longitude/latitude or GeoJSON. |
| `GET /api/barriers/:id` | Retrieve one barrier and provenance. | One full barrier record, or 404. |
| `POST /api/proposals/generate` | Accept only known `scenarioId`, `barrierId`, and `interventionId`; reload trusted data, compute comparison, request Gemini draft, validate, persist to Tiger Data. | `{ proposalId, facts, draft, aiGenerated, warnings }`. |
| `GET /api/proposals/:id` | Retrieve a saved proposal for review/export. For the public hackathon demo, use random, unguessable IDs and do not store personal contact details. | Saved proposal and evidence/metrics snapshot. |

**Frontend integration:** The `Explore` scene fetches nearby records; `Improve` applies graph edits and animates them; `Compare` displays the deterministic before/after graph; `Propose` calls the generation API and shows an editable draft. The `Export PDF` button always renders official source links, route metrics, and the scenario's actual evidence status from the validated `facts` object, independent of Gemini prose.

**Failure behavior:** If Tiger Data is unavailable, the scene and route simulation still work using the checked-in demo dataset, but the UI labels saved-data actions unavailable. If Gemini is unavailable, the app creates the same proposal structure with a deterministic template. Do **not** claim a live sponsor integration worked in a demo where the fallback was used.

### F. Build sequence and acceptance tests

- [ ] **DB setup:** Create Tiger Cloud PostgreSQL, enable PostGIS, apply migration, seed attributable Wellesley example data.
- [ ] **Spatial proof:** Moving the demo view calls a real query and changes which records are returned; source and evidence labels display accurately.
- [ ] **Routing proof:** Selecting a different intervention really changes accessible graph edges and recalculates distances or reachability.
- [ ] **Gemini proof:** A server endpoint sends the validated results and receives a distinct, well-formed civic proposal; no route calculations are delegated to the model.
- [ ] **Persistence proof:** Proposal JSON and associated calculation snapshot are saved to Tiger Data and retrievable by ID.
- [ ] **Integrity proof:** Altered client-supplied meters, false `verified` labels, or arbitrary IDs are rejected or ignored by the server.
- [ ] **Public demo proof:** An unfamiliar judge can complete the loop without keys, accounts, or operator intervention.
- [ ] **Fallback proof:** API and DB outage tests preserve the cinematic walkthrough and a clearly labeled template proposal.

**If behind schedule:** Finish the end-to-end Wellesley scenario and exported proposal first. Keep Gemini as the first sponsor to integrate and Tiger Data as the next meaningful integration. Cut multi-city loading, user accounts, Mastra, and optional hosting before weakening the main judge experience.

**Implementation references:** [Gemini structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output) · [Tiger Cloud service quickstart](https://www.tigerdata.com/docs/get-started/quickstart/create-service) · [Tiger Data geospatial/PostGIS tutorial](https://www.tigerdata.com/docs/learn/tutorials/analyze-transport-data).

---

## 9. The advocacy proposal

The exported document should be an actual usable artifact, not just a decorative screen.

**Suggested sections:**

1. **Location:** City, neighborhood, nearest mapped feature, and optional coordinates.
2. **Issue:** Concise description and affected route/destination.
3. **Evidence:** Data source, date if available, and evidence status.
4. **Suggested intervention:** What would change and why it could help.
5. **Modeled outcome:** Accessible route before/after, distance or reachability change, and assumptions.
6. **Action requested:** Ask the relevant municipal department to review the issue and evaluate feasibility.
7. **Next steps:** Where to share the proposal; do not invent a specific department or submission link without verification.

**Example phrasing:**

> This proposal identifies a potential pedestrian accessibility improvement near [location]. MORROW's model suggests the change could improve access between [origin] and [destination]. The scenario should be reviewed on-site by qualified local officials before any infrastructure decision.

## 10. Hackathon execution strategy

WHACK is a short competition. Prioritize a convincing end-to-end demo before broadening the feature set.

| Phase | Focus | Completion gate |
|---|---|---|
| 1. Foundation | Set up app, deployment, Wellesley scene, simple data graph | Public URL opens and renders reliably. |
| 2. Actual usefulness | Origin/destination, barrier, modification, routing recomputation | A judge can cause a genuine calculated change. |
| 3. Civic action + Gemini | Validated facts into Gemini-assisted proposal drafting, with a template fallback | A proposal can be exported even if Gemini is unavailable. |
| 4. Cinematic polish | Camera motion, transitions, lighting, micro-interactions | Demo feels memorable, not merely functional. |
| 5. Reliability | Test multiple browsers, performance, keyboard fallback, rehearse pitch | Unassisted judge can complete the key flow. |
| 6. Optional sponsor depth | Add Mastra step orchestration; then Tiger Data spatial queries; then Vultr backend hosting | Every claimed sponsor has a demonstrated, functioning integration without degrading reliability. |

**Rule:** If the core flow is not finished, cut extra cities, fancy secondary animations, and optional sponsor integrations before cutting the proposal or route-recalculation engine. Do not sacrifice a first-place-caliber Better Worlds demo to qualify for minor sponsor prizes.

## 11. How we maximize the chance of winning

MORROW must make four things obvious to judges:

- **Problem:** Many people cannot easily analyze or explain how neighborhood design affects accessibility.
- **Solution:** MORROW transforms a neighborhood issue into a visualized, testable proposal.
- **Technical substance:** Interactive 3D visualization plus genuine graph routing and scenario recalculation; evidence-grounded Gemini proposal drafting with optional Mastra workflow and Tiger Data geospatial persistence.
- **Human impact:** An ordinary resident leaves with a concrete document to support a community conversation.

### Differentiation

MORROW is **not** just a map of barriers, a static redesign mock-up, or an aesthetic city-builder. The complete loop is what matters: **observe → intervene → measure → advocate**.

### Failure risks to avoid

- A beautiful scene with no actual underlying functional change.
- An accessibility concept that fails basic keyboard or low-motion accessibility checks.
- Fake problems presented as verified local findings.
- Hard-coded numbers passed off as measured impact.
- An overambitious all-city engine that prevents completion of the flagship demo.
- A PDF that is visually impressive but contains no actionable next steps.

## 12. Demo-day pitch

**Opening:** “What if you didn't need to be an urban planner to improve your neighborhood?”

**Show:** “This is MORROW. Let's start here in Wellesley. Imagine trying to reach this destination, but part of the route isn't accessible.”

**Interact:** “What happens if we improve this crossing? Watch the route change. MORROW recalculates what becomes reachable.”

**Finish:** “Now we can turn that idea into a clear proposal to share with a local decision-maker. MORROW helps communities see a better tomorrow and take the first step toward it.”

## 13. Definition of done

We can confidently submit MORROW when an unfamiliar judge can open a public link, understand the issue, manipulate at least one intervention, see a valid modeled before/after result, and export a credible proposal **without our help**.

The flagship world should be gorgeous. The experience should be interactive. The claimed impact should be honest. **The output should be useful outside the demo.**

---

**Working name:** MORROW  
**Tagline:** Make tomorrow possible.  
**Primary track:** Better Worlds (Social Impact)  
**Showcase:** Wellesley, Massachusetts  
**North star:** Win with a civic tool that is aesthetically unforgettable *and* substantively useful.
