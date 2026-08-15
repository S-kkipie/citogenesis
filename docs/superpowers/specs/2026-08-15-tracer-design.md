# Citogenesis — Part 1 Design: ChainTracer + Data Clients + Input Adapters

**Date:** 2026-08-15
**Status:** Approved in brainstorm (design decisions locked with user)
**Workstream:** Part 1 (`feat/tracer`). NO LLM — pure API.
**Owns:** `src/core/citations/**`
**Parent specs:** [stack-architecture-design](./2026-08-15-stack-architecture-design.md),
[parallel-plan](../coordination/2026-08-15-parallel-plan.md).
**Contracts consumed (orchestrator-owned, on `main`):**
`src/core/run/domain/{ports,graph,state,trace}.ts`.

This spec designs *inside* Part 1. It does not re-litigate the locked stack
(TypeScript / Next 16 / Elysia / LangGraph.js / OpenAlex / Vercel).

## 1. Scope & ports

Part 1 covers everything between raw user input and a labeling-ready citation
graph. It implements exactly two ports from `domain/ports.ts`:

```ts
type ResolveInput = (input: RunInput, emit: TraceEmit)
  => Promise<{ claim: string; anchors: WorkId[]; errors: RunError[] }>;

type TraceChain = (anchors: WorkId[], budget: TraceBudget, emit: TraceEmit)
  => Promise<{ graph: CitationGraph; cycles: WorkId[][]; errors: RunError[] }>;
```

Both are exported from `src/core/citations/index.ts`. The orchestrator swaps the
stubs in `src/core/run/server/graph.ts` at merge time (Part 1 never touches that
file). No LLM calls anywhere in this workstream.

**Contract rules honored:**
- Call `emit` on start / progress / recovery / done — keeps the audit log and SSE
  stream live.
- Throw ONLY on unrecoverable failure. Every recovered failure (retry → S2
  fallback → `unresolved`) is reported via `RunError{ recovered: true }`, never an
  abort. A single bad node never fails the run.

## 2. Module structure

```
src/core/citations/
  index.ts              exports resolveInput, traceChain
  clients/
    http.ts             injectable fetch + retry/backoff + Retry-After honoring
    openalex.ts         search, batch getWorks, mailto polite pool
    semanticscholar.ts  fallback client, ~1 RPS throttle
  resolve/
    index.ts            resolveInput: dispatch on RunInput.kind
    claim.ts            Door A
    paper.ts            Door B
    wikipedia.ts        Door C
  trace/
    bfs.ts              traceChain: level-synchronous BFS + budget + cycles
    prioritize.ts       ref ranking (topic overlap + year)
    cycles.ts           Tarjan SCC over the final graph
  mappers.ts            OpenAlex/S2 JSON → CitationNode
  fixtures/             recorded JSON + fixture loader
  *.test.ts             vitest, colocated
```

`http.ts` exposes the transport as an injected dependency (a `fetch`-shaped
function) so every test runs offline against fixtures with zero network.

## 3. Data clients

### 3.1 OpenAlex (primary)

Base `https://api.openalex.org`. Every request carries
`mailto=<ServerConfig.openAlexMailto>` (polite pool).

- **`search(query, perPage=10)`** → `GET /works?search=<q>&per_page=10`. Returns
  works in OpenAlex relevance order (used by Door A).
- **`getWorks(ids: WorkId[])`** → batch `GET /works?filter=openalex:W1|W2|...`,
  chunked at **≤50 ids per OR-filter** (OpenAlex's documented `|` cap; the stack
  spec's "100/call" is optimistic — 50 is the safe cap, one const to bump if
  OpenAlex confirms higher). `per_page=50`.
- **`select=`** only the fields we map, to shrink payloads:
  `id,title,publication_year,doi,type,primary_location,authorships,
  abstract_inverted_index,cited_by_count,is_retracted,referenced_works,topics,
  best_oa_location`.

**Retry/backoff** (in `http.ts`, shared): exponential backoff with jitter, 3
attempts, on `429` / `5xx` / network error; honor `Retry-After` when present.
`4xx` other than `429` → no retry (deterministic failure). After exhaustion the
caller decides fallback vs. `unresolved`.

### 3.2 Semantic Scholar (fallback)

Base `https://api.semanticscholar.org/graph/v1`. A serialized queue enforces a
**~1 RPS** minimum interval (no key assumed).

- `getPaper(externalId)` → `GET /paper/DOI:<doi>` or `/paper/arXiv:<id>` with
  `fields=title,year,externalIds,abstract,citationCount,references`.

**Honest fallback semantics — a real, documented limitation:** S2 can only
rescue a node when we already hold a DOI or arXiv id for it. The BFS walks
OpenAlex `referenced_works` (opaque `W…` ids); if OpenAlex fails to return
metadata for such an id, we have no DOI to hand S2, so that node becomes
`unresolved`. S2's concrete value is therefore:
1. Door B resolution when the input is a DOI/arXiv id.
2. Abstract/metadata backfill for nodes that carry a DOI but came back thin.

This limitation goes in the README reproducibility section (it is honest and
auditable, not a bug to hide).

## 4. ChainTracer — `traceChain`

Level-synchronous BFS backwards through `referenced_works`.

**State:** a queue of `{ id, depth }`, a `visited` set, a `Map<WorkId,
CitationNode>`, an edge list, and per-node `parent` tracking for progress.

**Algorithm:**
1. Seed the queue with `anchors` at `depth 0`. Batch-fetch the anchors' metadata
   (OpenAlex `getWorks`). Emit `start`.
2. Process **one BFS level at a time** so an entire frontier is fetched in one
   batched round-trip (fewer requests, deterministic ordering).
3. For each frontier node with `depth < budget.maxDepth`:
   - Batch-fetch metadata for all of its `referenced_works`.
   - **Rank** them (§5); keep the **top `budget.maxRefsPerNode` (25)** as graph
     nodes and recursion frontier. Discard the rest — but count them and set
     `graph.truncated = true`, and emit a `progress` event
     (`"W… expanded 25/<total> refs"`). No silent truncation.
   - Add an edge `{ from: parentId, to: refId }` for each kept ref.
4. Stop adding nodes once the graph reaches `budget.maxNodes` (200):
   `truncated = true`, emit `progress`.
5. Emit `done` with `{ nodes, edges, cycles }` counts.

**Cycle detection (pathogen #1, free):** after traversal, run Tarjan SCC over the
directed graph (`trace/cycles.ts`). Every SCC of size > 1 (and any self-loop)
is a cycle → returned as `cycles: WorkId[][]`. Deterministic, and independent of
BFS visitation order.

**Fetch-cost note (explicit tradeoff):** topic-overlap ranking needs the
children's `topics`, which requires fetching them before we know which 25 to
keep — so we fetch more nodes than we expand. Bounded by `maxNodes:200` plus
batching (≤50/request), it stays comfortably inside OpenAlex's 100k/day quota.
A future two-tier optimization (fetch minimal `id,topics,year` to rank, then
full-fetch only the kept 25) is noted but NOT built for MVP (YAGNI).

## 5. Ref prioritization (`trace/prioritize.ts`)

Chosen heuristic: **relevance-to-claim, oldest-as-tiebreak.**

- `claimFingerprint` = union of the anchors' OpenAlex `topics` (ids, optionally
  weighted by OpenAlex topic score).
- For each candidate ref: `score = overlap(ref.topics, claimFingerprint)`
  (count / Jaccard of shared topic ids).
- Sort **descending by score**, tie-break **ascending by `year`** (older = closer
  to the primary origin).
- Deterministic and explainable — the ranking rationale can be surfaced in the
  trace, which serves the "auditable result" deliverable.

## 6. Input adapters — `resolveInput`

Dispatch on `RunInput.kind` (discriminated union in `state.ts`).

### 6.1 Door A — `claim`

1. `openalex.search(text, perPage=10)`.
2. Pick the **first candidate with non-empty `referenced_works`** (else BFS
   dead-ends immediately); tie-break by `cited_by_count`.
3. `emit` a `progress` event whose `data` carries the **top-5 candidates**
   (`{ id, title, year, citedByCount, hasRefs }`) — this is the "candidates in
   trace" audit trail the frontend can later use for override.
4. If NO candidate has references → take the top-1 anyway and append a
   `RunError{ agent:'input-adapter', recovered:true }` noting the weak anchor.
5. Return `anchors = [picked]`.

### 6.2 Door B — `paper`

Detect the id shape and resolve to a single `WorkId`:
- `^W\d+$` → use directly.
- DOI (`10.\d+/…` or a `doi.org` URL) → `GET /works/doi:<doi>`.
- arXiv (`arXiv:<id>` or `NNNN.NNNNN`) → try OpenAlex via the minted DOI
  `10.48550/arXiv.<id>`; on miss, S2 `/paper/arXiv:<id>` → title → `search`.
  Documented limitation: reliable for post-2022 arXiv; older ids fall back to
  title match.

Return `anchors = [workId]`.

### 6.3 Door C — `wikipedia`

1. Fetch the page HTML (Wikipedia REST `/page/html/<title>`).
2. If `statement` is given: locate that text, collect the `[n]` superscripts
   attached to it, map each to its entry in the references list.
   If omitted: fall back to the **whole page**, capped at ~20 resolvable refs,
   with a `progress` note in the trace.
3. From each reference entry extract an identifier, preferring **DOI > PMID >
   title/URL**.
4. Resolve each identifier to a `WorkId` (`/works/doi:` / `/works/pmid:` / title
   `search`); dedupe.
5. Return `anchors = <resolved set>`. Unresolvable references → `RunError`
   (recovered), not an abort.

**Dependency:** Door C needs an HTML parser (`cheerio` or `linkedom`). See §9 —
this is a `package.json` change, orchestrator-owned.

## 7. Unresolved nodes (shape fixed by contract)

`CitationNode.fetchStatus` is already `'resolved' | 'unresolved'` in `graph.ts`.

- A node whose OpenAlex **and** S2 lookups both fail is kept in the graph with
  `fetchStatus:'unresolved'` so coverage stats stay honest.
- Non-nullable fields get placeholders: `title:'(unresolved)'`, `type:'unknown'`,
  `authors:[]`, `citedByCount:0`, `isRetracted:false`, `source:'openalex'` (the
  id came from an OpenAlex `referenced_works` list), `abstract:null`, `oaUrl:null`,
  `doi:null`, `year:null`. `depth` is known from the BFS.
- Reporting: **one aggregated `RunError`** per failed batch
  (`"3 nodes unresolved: W…, W…, W…"`, `recovered:true`) plus a per-node
  `recovery` trace event for detail. Keeps `errors[]` readable while the trace
  keeps full granularity.
- `coverage` (in the eventual verdict) is computed from `fetchStatus` counts:
  `resolved / total`.

## 8. Testing (vitest)

- **Fixtures:** recorded real OpenAlex JSON under `fixtures/openalex/*.json`; a
  fixture-backed transport injected into the clients → all unit tests offline,
  fast, deterministic.
- **Cases:**
  - BFS budget: `maxDepth`, `maxRefsPerNode`, `maxNodes` caps each enforced;
    `truncated` set correctly.
  - Cycle detection: a crafted cyclic fixture (`A→B→C→A`) → exactly that cycle.
  - Prioritization: given topics + years, the expected 25 survive in order.
  - Mappers: `abstract_inverted_index` reconstruction, `best_oa_location →
    oaUrl`, retraction flag.
  - Adapters: Door A composite pick + candidate emission; Door B DOI/arXiv/
    OpenAlex-id resolution; Door C `[n]`→ref→identifier mapping and statement
    fallback.
  - Coverage bookkeeping: unresolved placeholder shape + aggregated `RunError`.
- **Live smoke (CI-optional):** one depth-1 traversal against live OpenAlex,
  gated behind an env flag.

## 9. Coordination items (orchestrator-owned — Part 1 will NOT edit)

1. **HTML parser dependency** for Door C: request adding `cheerio` (or
   `linkedom`) to `package.json`. Part 1 does not edit shared `package.json`.
2. **Unresolved placeholders**: Part 1 fills placeholder values for non-nullable
   `CitationNode` fields (§7). This needs no contract change — flagged for
   awareness only. If the orchestrator prefers nullable fields instead, that is a
   `graph.ts` change and must come from the orchestrator.

## 10. Out of scope

- Everything LLM (PrimacyJudge / DriftAuditor / Verdict) — Part 2.
- `primacy` labeling of nodes — set later by Part 2 (field left `undefined`).
- Frontend rendering of the graph/trace — Part 3.
- Origin-candidate selection — that is PrimacyJudge's job (Part 2), not the
  tracer's.

## 11. Build order

1. `http.ts` (retry/backoff) + `openalex.ts` + `mappers.ts` + fixtures.
2. `traceChain` BFS + `prioritize.ts` + `cycles.ts` (prove the graph, offline
   tests).
3. `semanticscholar.ts` fallback wiring.
4. Adapters: Door B (simplest) → Door A → Door C (needs the parser dep).
5. `index.ts` exports both ports; hand off to orchestrator via PR.
