# Citogenesis — Stack & Architecture Design

**Date:** 2026-08-15
**Status:** Approved in brainstorm session (stack decisions locked)
**Context:** See [CLAUDE.md](../../../CLAUDE.md) for the product brief (4 citation
pathogens, 3 input doors, agent roster). This spec locks the technical stack and
high-level architecture. It does not re-litigate the product idea.

## 1. Stack (decided)

| Layer | Choice | Rationale |
|---|---|---|
| Base repo | [`S-kkipie/hackaton-starter`](https://github.com/S-kkipie/hackaton-starter) (Next 16 + Elysia + Drizzle/Postgres, TypeScript) | Author's own starter; auth/CRUD scaffolding already familiar |
| Auth | **Removed** (Better Auth stripped) | Judges must try the demo in seconds; auth adds zero rubric points. Simple per-IP rate limit protects the Gemini quota |
| Agent orchestration | **LangGraph.js**, running inside an Elysia route in the same Next app | One repo, one deploy, no CORS. LangGraph.js API ≈ Python API (author has LangGraph experience). State is serializable → per-phase requests possible if timeouts bite |
| LLM | **Gemini API** (paid key available; rate limits not a constraint) | See model mapping below |
| Citation data | **OpenAlex** (primary; no key, batch `filter=openalex:W1\|W2`, 100/call, `mailto=` for polite pool) + **Semantic Scholar Graph API** (backup, abstracts/TLDR, ~1 RPS) | Free, confirmed feasible in brief |
| Full text | OpenAlex `best_oa_location` → arXiv / PMC | Demo on OA papers so full text is guaranteed |
| Graph UI | **react-flow** inside the Next frontend | Interactive citation graph is the demo centerpiece (20% rubric) |
| Persistence | Postgres via Drizzle (already in starter) | Stores run traces → auditable result + shareable run pages |
| Deploy | **Vercel Hobby**, `maxDuration: 300` (fluid compute), SSE streaming for run progress | Zero-config for Next 16. Estimated run time 60–160s fits in 300s |

### Rejected alternatives (recorded so we don't revisit)

- **Cloudflare Workers + OpenNext**: LangGraph.js does run there (nodejs_compat
  is default since compat date 2026-08-04), and wall-clock is effectively
  unlimited — but OpenNext adapter friction, no raw TCP to Postgres (Hyperdrive
  or D1 schema rewrite), and Postgres/Redis checkpointers are broken on Workers
  (langgraphjs #1692). Setup hours buy zero rubric points. Fallback if Vercel's
  300s ever becomes a real problem.
- **Python core (FastAPI + LangGraph py)**: author's exact experience, but two
  services, two deploys, CORS, worse repro story for judges.
- **CrewAI / AutoGen**: less explicit control of handoffs/failure than a state
  graph; the problem *is* a graph, LangGraph models it natively.
- **Streamlit / static HTML frontend**: weaker demo; react-flow chosen.

## 2. Model mapping (benchmark-informed, Aug 2026)

| Agent | Model | Why |
|---|---|---|
| ChainTracer | **none** (pure API) | Graph traversal is HTTP calls; keeping LLMs off the hot path is the cost-efficiency story |
| PrimacyJudge | `gemini-3.5-flash-lite` | Batched classification (≈50 nodes/prompt) over metadata; cheap and fast |
| DriftAuditor | `gemini-3.6-flash` | Best long-context retrieval in current lineup (beats 3.1 Pro on 4/6 head-to-head tasks); reads full papers |
| Verdict/Writer | `gemini-3.6-flash` | Synthesis + report writing |

- `gemini-3.1-pro` is a **benchmarked fallback**, not a default: paid key makes
  it available; if the drift benchmark (below) shows 3.6 Flash missing subtle
  claim deformation, upgrade DriftAuditor only.
- **Drift benchmark plan**: once DriftAuditor exists, run 3 real claims ×
  {3.5-flash-lite, 3.6-flash, 3.1-pro} and compare drift-score quality by hand.
  Data-driven final call, ~half a day.

## 3. Architecture

```
Next 16 app (single deploy on Vercel)
├── frontend (react-flow graph + verdict card + run progress)
├── /api/v1 (Elysia)
│   ├── POST /runs        → start a run, stream progress via SSE
│   ├── GET  /runs/:id    → stored run trace (JSON)
│   └── input adapters    → claim | arXiv/DOI | Wikipedia URL → (claim, anchor)
├── core/ (LangGraph.js state graph)
│   ChainTracer → PrimacyJudge → DriftAuditor → Verdict
│   every node handoff appended to run-trace JSON
└── Postgres (Drizzle): runs table — input, trace, graph, verdict
```

### Agent graph & handoffs

- **State**: one serializable object — claim, anchor work, citation graph
  (nodes + edges), node labels, drift findings, verdict. Every LangGraph node
  reads/writes this state; every transition is logged to the run trace with
  timestamp, agent name, input summary, output summary. The trace *is* the
  auditable result deliverable.
- **ChainTracer**: BFS backwards through `referenced_works`.
  **Budget: depth ≤ 3, ≤ 25 references expanded per node, ≤ 200 nodes total.**
  Cycle detection on the fly (pathogen #1 falls out of traversal for free).
- **PrimacyJudge**: heuristics first (OpenAlex `type` field: review/editorial/
  letter → secondary), LLM only for ambiguous nodes, batched on
  title + abstract + venue + type.
- **DriftAuditor**: runs only on origin candidates (roots of the support
  chains, ≤ 3 papers). Fetch OA full text, compare against the claim.
  Drift rubric: 4-point scale — `supported` / `partially-supported` (caveats
  dropped) / `drifted` (scope or strength inflated) / `contradicted` — plus a
  quoted evidence span from the origin text.
- **Verdict**: deterministic scoring skeleton (pathogen flags + primary-source
  ratio + drift levels → confidence LOW/MEDIUM/HIGH) with LLM-written prose
  justification. Numbers come from code, words from the model.

### Failure handling (25% rubric: real coordination)

- OpenAlex error/timeout → retry with backoff → fall back to Semantic Scholar
  for that node → if still failing, mark node `unresolved` and continue; the
  verdict reports coverage ("38/40 nodes resolved").
- No OA full text for an origin → DriftAuditor falls back to abstract-level
  comparison and lowers its own confidence, flagged in the trace.
- LLM output fails schema validation → one retry with error feedback → on
  second failure, node marked `unlabeled`, excluded from score, reported.

### Timeout strategy

Single request, `maxDuration: 300`, SSE progress events per agent phase.
Escape hatch (only if real runs exceed ~250s): the serialized LangGraph state
already supports splitting into per-phase requests orchestrated by the client.
Do not build this preemptively (YAGNI).

## 4. Testing

- Unit: input adapters (claim/arXiv/Wikipedia parsing), BFS budget + cycle
  detection against fixture graphs, verdict scoring rules.
- Fixtures: recorded OpenAlex JSON responses → traversal tests run offline,
  fast, deterministic.
- LLM nodes: schema validation tests with mocked responses; quality checked via
  the drift benchmark, not unit tests.
- One end-to-end smoke test against live OpenAlex on a tiny known graph
  (depth 1) — run manually / CI-optional.

## 5. Out of scope (this spec)

- Flagship demo claim selection (demo-content decision, made during demo prep).
- Exact react-flow visual design.
- 3-min video script, 200-word summary (submission prep).

## 6. Next step

`writing-plans` skill → implementation plan. Build order from the brief stands:
ChainTracer first (pure API, proves the graph), then PrimacyJudge, DriftAuditor,
Verdict, then input adapters (Wikipedia first), then frontend.
