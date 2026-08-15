# Citogenesis — LLM Agents Design (Part 2)

**Date:** 2026-08-15
**Status:** Approved in brainstorm (user OK 2026-08-15). Reconciled against the
landed shared contracts (`src/core/run/domain/`, commits 5a9f7a3 / b97d3ba).
**Scope:** `src/core/agents/**` — the three LLM ports plus the Gemini wrapper and
the drift benchmark. Everything that calls Gemini.
**Parent specs:**
[stack-architecture](./2026-08-15-stack-architecture-design.md) ·
[parallel-plan](../coordination/2026-08-15-parallel-plan.md)

This spec designs *inside* Part 2. Stack is locked upstream; contracts are
orchestrator-owned and consumed as-is.

## 0. Contract surface (consumed, not owned)

Implement three ports from `src/core/run/domain/ports.ts`, exported from
`src/core/agents/index.ts`. The orchestrator swaps stubs in
`src/core/run/server/graph.ts` at merge — **we never touch that file**.

```ts
JudgePrimacy = (graph, emit) =>
  Promise<{ nodes: CitationNode[]; originCandidates: WorkId[]; errors: RunError[] }>
AuditDrift   = (claim, origins: CitationNode[], emit) =>
  Promise<{ findings: DriftFinding[]; errors: RunError[] }>
WriteVerdict = ({ claim, graph, cycles, driftFindings, errors }, emit) =>
  Promise<Verdict>
```

Key facts pulled from the contracts (do not re-derive elsewhere):

- `Primacy = { label: 'primary'|'secondary'|'unknown'; method: 'heuristic'|'llm'; rationale?: string }`.
  **No `sourceType` field** — source-type coloring uses the existing
  `CitationNode.type`. `unknown`, not `uncertain`.
- `CitationNode` already carries: `type`, `title`, `abstract`, `venue`, `year`,
  `authors`, `citedByCount`, `isRetracted`, `oaUrl`, `depth`, `fetchStatus`,
  `source`, optional `primacy`.
- `DriftFinding = { workId; label: 4-level; evidenceQuote: string|null; explanation: string; basis: 'fulltext'|'abstract' }`.
  No separate confidence field — `basis:'abstract'` **is** the lowered-confidence
  signal. No `claimText` (claim is run-level).
- `Verdict = { confidence: LOW|MEDIUM|HIGH; score: 0–100 (code); pathogens: Pathogen[]; primaryRatio: 0–1; coverage: {resolved,total}; prose: string (LLM) }`.
- `RunError = { agent: AgentName; message: string; recovered: boolean }`. Ports
  return `errors[]` for recovered failures; **throw only on unrecoverable**.
- `TraceEmit = (event: Omit<TraceEvent,'ts'>) => void`; phases
  `start|progress|handoff|recovery|error|done`; our agent names
  `primacy-judge | drift-auditor | verdict`.
- Deps: `@google/genai@^2.17.1` installed. Key: `ServerConfig.geminiApiKey`.
- Models locked: `gemini-3.5-flash-lite` (Primacy), `gemini-3.6-flash`
  (Drift/Verdict), `gemini-3.1-pro` only if the benchmark justifies it.

## 1. Module layout (`src/core/agents/`)

```
gemini/
  client.ts          # GoogleGenAI singleton from ServerConfig.geminiApiKey
  call-structured.ts # callStructured<T>() — schema, 1 retry, mark-and-continue
  upload-pdf.ts       # File API upload from a URL (DriftAuditor)
  errors.ts          # AgentSchemaError, toRunError()
primacy/
  heuristics.ts      # OpenAlex type → label routing (pure)
  origin-select.ts   # DAG-root selection → ≤3 originCandidates (pure)
  prompt.ts          # batched primacy prompt + per-node output schema
  judge-primacy.ts   # JudgePrimacy port impl
drift/
  fetch-text.ts      # oaUrl → PDF (File API) | abstract fallback
  prompt.ts          # drift prompt + DriftFinding output schema
  audit-drift.ts     # AuditDrift port impl
  benchmark/
    bench.ts         # 3 claims × N models → comparison table (manual run)
    fixtures/        # recorded claims + origin PDFs/abstracts
verdict/
  score.ts           # pure deterministic scorer (pathogens, score, confidence)
  prompt.ts          # prose prompt + schema
  write-verdict.ts   # WriteVerdict port impl
index.ts             # export { judgePrimacy, auditDrift, writeVerdict }
```

## 2. Gemini wrapper (`gemini/`)

### `callStructured<T>`

```ts
callStructured<T>(opts: {
  model: string;
  system?: string;
  contents: Content[];          // text and/or uploaded file parts
  schema: z.ZodType<T>;
  agent: AgentName;             // for trace + RunError
  emit: TraceEmit;
  label: string;                // human summary for the trace
}): Promise<{ data: T; usage: TokenUsage; latencyMs: number }>
```

- Request config: `responseMimeType:'application/json'`,
  `responseJsonSchema: z.toJSONSchema(schema)` (zod v4).
- Response text → `JSON.parse` → `schema.parse`.
- **Schema failure (parse or validation):** one retry, appending a user turn with
  the validation error + the offending output ("your previous output failed
  validation: <err>. Return corrected JSON only."). Emit `phase:'recovery'`.
- **Second failure:** throw `AgentSchemaError` (carries agent + last error). The
  caller catches it, records a `RunError{recovered:true}`, marks the unit
  (node `unknown` / finding skipped), and continues.
- **Transient API errors (429/5xx):** exponential backoff, up to 3 tries,
  independent of the schema retry. Paid key → rare, still handled.
- Returns token usage (`usageMetadata`) + wall-clock latency for cost reporting
  and the benchmark.
- Emits `start` then `done` (or `recovery`/`error`) with `{model, tokens, latencyMs}`
  in `data`.

### `uploadPdf(url)`

Fetch bytes from `oaUrl`; if `content-type` is a PDF (or URL ends `.pdf`), upload
via Files API and return a file part. Non-PDF / fetch failure → return `null`
(caller falls back to abstract). Size guard: skip > ~20 MB, treat as no-fulltext.

## 3. PrimacyJudge (`primacy/`) — `gemini-3.5-flash-lite`

### Heuristic routing (`heuristics.ts`, pure, no LLM)

| OpenAlex `type` | label | method |
|---|---|---|
| `review` | secondary | heuristic |
| `editorial` `letter` `erratum` `paratext` `book-review` `book` `report` | secondary | heuristic |
| `dataset` | primary | heuristic |
| `article` `preprint` `other` / missing / anything else | → LLM | — |

"Ambiguity threshold" = this routing table, not a number. `article` is inherently
ambiguous (primary research OR narrative review) → always LLM.
`fetchStatus:'unresolved'` nodes are skipped (left `undefined` primacy, counted
only in coverage).

### LLM batch

- Batch the ambiguous nodes ~50 per prompt (`gemini-3.5-flash-lite`).
- Per-node input: `{ id, title, abstract(truncated ~1500 chars), venue, type, year }`.
- Output schema: `{ results: { id: WorkId; label: primary|secondary|unknown; rationale: string }[] }`.
  `method` is stamped `'llm'` by us, not asked of the model.
- **Robustness:** validate every input id appears exactly once in the output.
  Missing/extra/duplicate ids → one retry (via the wrapper) → still bad → the
  missing nodes get `{label:'unknown', method:'llm'}`, a `RunError{recovered:true}`
  is recorded, batch continues. One bad batch never sinks the others.

### Origin selection (`origin-select.ts`, pure) → `originCandidates` (≤3)

Edges are `from cites to` (BFS backward: `to` is older). An **origin** is a
citation-DAG sink — it references nothing else we traced.

1. Candidate set = resolved nodes with in-graph out-degree 0
   (no edge `from == node`), i.e. chain roots. If none (fully cyclic), fall back
   to the deepest nodes (`max depth`).
2. Rank by: in-graph **fan-in** (count of edges `to == node`) desc →
   `citedByCount` desc → `oaUrl != null` first (so DriftAuditor can read them).
3. Take top ≤ 3.

Pure and fixture-testable; independent of the LLM.

### Port result

`{ nodes: <graph.nodes with primacy filled>, originCandidates, errors }`.
Trace: `start` → `progress` (heuristic n, llm-batch n) → `handoff` (origins
chosen) → `done`.

## 4. DriftAuditor (`drift/`) — `gemini-3.6-flash`

Runs on the ≤3 `origins` passed in (full `CitationNode`s). Per origin:

1. `fetch-text.ts`: `uploadPdf(origin.oaUrl)` → PDF file part (`basis:'fulltext'`).
   `null` → abstract text part (`basis:'abstract'`, lower confidence). No abstract
   either → record `RunError{recovered:true}`, skip this origin (no finding).
2. `call-structured` (`gemini-3.6-flash`): system = drift rubric; contents =
   claim + origin metadata + (PDF part | abstract text). Output schema:

```ts
{ workId: WorkId;
  label: 'supported'|'partially-supported'|'drifted'|'contradicted';
  evidenceQuote: string | null;   // verbatim span from the origin; null if none found
  explanation: string;            // 1–2 sentences
}
```
   `basis` is stamped by us from which path fired (not asked of the model).

Rubric (in the prompt): **supported** = claim matches the origin's finding;
**partially-supported** = origin supports it but with dropped caveats/conditions;
**drifted** = scope or strength inflated beyond what the origin shows;
**contradicted** = origin shows the opposite / does not support it. Ask for a
verbatim `evidenceQuote` for any label other than a clean `supported`.

Failure isolation: one origin failing (fetch/upload/schema) never blocks the
others; each yields either a finding or a recovered `RunError`.

Trace: `start` → `progress` per origin (`basis` + label) → `done`.

## 5. Verdict (`verdict/`) — `gemini-3.6-flash`

Two stages: **(a) deterministic scorer in code, (b) LLM prose.** Numbers come
from code; the LLM only writes words and can never change the score.

### `score.ts` (pure) → `{ confidence, score, pathogens, primaryRatio, coverage }`

Inputs: `graph` (primacy-filled nodes), `cycles`, `driftFindings`,
`originCandidates` (recomputed from the graph the same way as §3, or read off the
nodes — see Open/coordination).

Derived signals:
- `coverage = { resolved: nodes with fetchStatus 'resolved', total: nodes.length }`.
- `primaryRatio = primary / (primary + secondary)` over labeled nodes
  (`unknown` excluded from the denominator). No labeled nodes → ratio 0.
- `worstDrift` = most severe label among findings
  (`supported < partially < drifted < contradicted`).
- `spof` = single dominant origin (one originCandidate with fan-in ≥ 3) that is
  fragile (`isRetracted` OR `type === 'preprint'`).

Pathogens (all that apply, in `Pathogen[]`):
- `circular-support` ← `cycles.length > 0`
- `no-primary-source` ← no `originCandidate` is `primary`
- `single-point-of-failure` ← `spof` true
- `claim-drift` ← any finding `drifted` or `contradicted`

**Hybrid scoring** (starting weights — pure fn, exhaustive tests, easy to tune):

```
GATES → LOW, score = 20 (flat):
  any finding 'contradicted'  |  any origin isRetracted
  |  circular-support         |  no-primary-source

else:
  penalty = (1 - primaryRatio) * 45
          + { supported:0, 'partially-supported':20, drifted:40 }[worstDrift]
          + (spof ? 25 : 0)
  score = clamp(round(100 - penalty), 0, 100)
  confidence = score >= 70 ? HIGH : MEDIUM
```

A lone `drifted` (−40) or `primaryRatio < 0.3` (−≥31) lands < 70 → MEDIUM, never
LOW unless a gate fires — matching the approved preview.

### `prompt.ts` + `write-verdict.ts`

- LLM (`gemini-3.6-flash`) receives the computed `{confidence, score, pathogens,
  primaryRatio, coverage}` + the drift evidence quotes + the claim, and writes a
  ≤120-word `prose` justification. Output schema `{ prose: string }`.
- Prose-write failure (schema ×2) → fallback to a templated deterministic
  sentence built from the numbers; record `RunError{recovered:true}`. The verdict
  is never blocked by the LLM.
- Assemble and return the full `Verdict`.

Trace: `start` → `progress` (score + pathogens) → `done`.

## 6. Drift benchmark (`drift/benchmark/`)

- `bench.ts`, parametrized by a model list, defaulting to
  `['gemini-3.5-flash-lite','gemini-3.6-flash','gemini-3.1-pro']`.
- 3 fixed claims + their recorded origin PDFs/abstracts as fixtures. Runs the
  DriftAuditor path per model → prints a table: `label · basis · latencyMs ·
  tokens · $est`.
- **Run manually after DriftAuditor lands**; quality judged by hand. Decides
  whether DriftAuditor upgrades to `gemini-3.1-pro`. Not a unit test; no live
  calls in CI.

## 7. Testing (LLM always mocked; zero live calls in unit tests)

| Unit | Coverage |
|---|---|
| `call-structured` | valid → ok · invalid-then-valid → 1 retry ok · invalid×2 → throws `AgentSchemaError` · 429 → backoff |
| `heuristics` | every routed type → expected label/route (pure table) |
| `origin-select` | sink detection, fan-in ranking, oaUrl tiebreak, all-cyclic fallback (fixture graphs) |
| primacy batch | id-set validation: missing/extra/dup → recovered `unknown` + RunError |
| `fetch-text` | PDF path vs abstract fallback vs no-text skip (mocked upload) |
| `audit-drift` | per-origin isolation: one fails, others still produce findings |
| **`score.ts`** | **highest value — exhaustive gate + weight cases, all pathogen combos, boundary scores (69/70)** |
| `write-verdict` | prose-fail → templated fallback + RunError |
| benchmark | manual only |

## 8. Coordination / open items (orchestrator)

1. **`originCandidates` in Verdict:** `WriteVerdict` args don't include
   `originCandidates` directly — only `graph`. The scorer recomputes them from the
   graph via the same `origin-select.ts` (single source of truth). Confirmed
   sufficient; flag to orchestrator only if they'd rather thread it through state.
2. **`isRetracted`** is provided per node by Part 1 (contract field). If Part 1
   can't populate it reliably from OpenAlex, the retraction gate degrades to
   "never fires" — safe, just less powerful. No contract change needed.
3. No shared-contract changes requested. If any surface later, message the
   orchestrator — never edit `src/core/run/domain/**` or `graph.ts` here.

## 9. Build order

1. `gemini/` wrapper (+ tests) — everything depends on it.
2. `verdict/score.ts` (pure) + tests — no LLM, highest-value logic, unblocks the
   scoring story early.
3. PrimacyJudge (heuristics → origin-select → batch LLM).
4. DriftAuditor (fetch-text → audit).
5. `verdict/` prose + `write-verdict.ts`; wire `index.ts`.
6. Benchmark harness; run after Drift works.
7. PR `feat/llm-agents` → `main`; notify orchestrator (they merge + swap stubs).
