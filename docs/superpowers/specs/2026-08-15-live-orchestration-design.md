# Live orchestration view — design

Date: 2026-08-15
Status: approved (brainstorm session; layout mockups in `.superpowers/brainstorm/`)

## Problem

Hitting Run today produces an ugly, empty experience:

1. `router.ts` streams with `streamMode: "values"`, so LangGraph only yields a
   snapshot **after each agent node completes**. Trace events arrive in
   per-agent bursts; during ChainTracer's BFS (the longest phase) the UI is
   dead for minutes.
2. The client's `state` (the citation graph) stays `null` for the whole run —
   it only arrives via the final GET. The canvas shows "Enter a claim to
   begin." during the entire run, then the full graph pops in at the end.
3. The only orchestration UI is `PipelineBar` (one line of text) plus
   `AuditLog` (plain text). No sense of agents collaborating — and agent
   collaboration is 25% of the hackathon judging.

## Goal

A live run view where **both** the multi-agent orchestration and the citation
graph are visible and animated in real time (hybrid layout, option 1 from the
mockups): an orchestration rail on the left showing agents working and handing
off, and the graph growing live on the right.

## Decisions locked during brainstorm

- Backend changes are in scope (live streaming, new SSE events).
- Layout: **hybrid 1** — vertical split. Dark orchestration rail (~320px) on
  the left; light graph canvas on the right. Active agent fires a subtle beam
  toward the canvas.
- Delta events are **ephemeral** — streamed only, never persisted. The graph
  is already persisted in `state.graph`; no DB bloat.
- `deriveGraphView` and `CitationGraph` are reused unchanged; the live partial
  state is shaped like a `RunState`.

## 1. Backend — live streaming

### Stream mechanics

- LangGraph 1.4.10 (installed = latest) supports `streamMode: "custom"` with
  `config.writer(chunk)` callable from inside node bodies.
- `router.ts` switches to `graph.stream(input, { streamMode: ["values",
  "custom"] })`. Chunks arrive as `[mode, payload]` tuples:
  - `"custom"` payloads → forwarded to SSE immediately (live trace + deltas).
  - `"values"` payloads → used exactly as today: final-state capture for
    persistence. Trace events are **no longer** diffed out of `values`
    snapshots (they now flow via `custom`); the `emitted` counter logic goes
    away.
- `graph.ts` node bodies receive `config` and build two channels:
  - `emit` (existing `TraceEmit`): pushes into the collector (persisted trace,
    unchanged) **and** writes `{ kind: "trace", event }` to the writer → trace
    events stream the moment they happen.
  - `emitDelta` (new): writes `{ kind: "delta", event }` to the writer only.
    Never persisted.

### New SSE events (`RunSseEvent` additions)

```ts
{ type: "claim-resolved", claim: string, anchors: WorkId[] }      // input-adapter
{ type: "graph-delta", nodes: CitationNode[], edges: CitationEdge[] } // chain-tracer
{ type: "nodes-patch", patches: { id: WorkId, primacy: Primacy }[] }  // primacy-judge
{ type: "origins", ids: WorkId[] }                                 // primacy-judge (end)
{ type: "drift-finding", finding: DriftFinding }                   // drift-auditor
```

Existing `accepted` / `trace` / `done` / `failed` are unchanged, so old
clients (and the replay page) keep working.

### Emission points

- `bfs.ts` (`traceChainWith`): after each parent expansion commits its batch,
  emit `graph-delta` with the newly committed nodes and new edges. Also one
  delta for the anchors at depth 0. Cycles are computed at the end and reach
  the client inside the tracer's `done` trace event data (already there).
- `judge-primacy.ts`: emit `nodes-patch` per labeled batch; emit `origins`
  once selection is done.
- `audit-drift.ts`: emit `drift-finding` after each origin audit completes.
- `resolve/index.ts`: emit `claim-resolved` once claim + anchors exist.

### Port signatures

Ports that emit deltas gain an optional last parameter
`emitDelta?: (e: DeltaEvent) => void`. Affected: `TraceChain`,
`JudgePrimacy`, `AuditDrift`, `ResolveInput`. Stubs and existing tests get the
parameter (may ignore it). Optional keeps every current call site compiling.

## 2. Client — live state

- `stream.ts`: `LiveView` gains `partial`:
  ```ts
  partial: {
    claim: string;
    graph: { nodes: CitationNode[]; edges: CitationEdge[]; truncated: boolean };
    cycles: WorkId[][];
    originCandidates: WorkId[];
    driftFindings: DriftFinding[];
  }
  ```
  `streamReducer` applies the new event types: `graph-delta` appends,
  `nodes-patch` patches primacy in place, `origins` / `drift-finding` /
  `claim-resolved` fill their fields. Node dedupe by id (server may resend an
  anchor). Cycles: parsed out of the tracer `done` trace event's data.
- `RunDashboard`: renders `state ?? runStateFromPartial(live)` through the
  existing `deriveGraphView`. The graph grows live, recolors when primacy
  patches land, gains drift badges as findings stream. The final GET state
  replaces the partial seamlessly (same data, richer verdict fields).
- Radial layout is deterministic by depth, so new nodes slot into their ring
  without reshuffling the existing ones.

## 3. Layout — hybrid 1

Grid `[320px_1fr]`, full height under the input bar.

### OrchestraRail (new, left, dark chrome)

- Five agent cards stacked vertically, connected by a rail line.
- Card states: idle (dim), running (amber border + glow, expanded), done
  (green check), recovered (amber), error (red + failure message).
- Active card shows live stats parsed from trace event `data` (node count,
  depth progress, LLM call label, retries).
- Handoff: an animated packet pulse travels down the connector when agent N
  ends and N+1 starts.
- Beam: subtle CSS gradient line from the active card toward the canvas.
- Verdict: the fifth card expands into the full `VerdictCard` content when the
  verdict arrives — the pipeline visually terminates in the verdict.
- `TraceFeed` (restyled `AuditLog`): bottom of the rail, mono font,
  auto-scroll, newest at the bottom, colored by phase.

### Canvas (right, light)

- `CitationGraph` (Sigma) unchanged in role; now receives a growing view.
- Pre-run: current "Enter a claim to begin." empty state.
- Run started, no nodes yet: claim text + "resolving anchors…" placeholder —
  the canvas is never blank during a run.
- `NodePanel` overlay and `Legend` stay as they are.

### Removed

`PipelineBar` and the current `AuditLog` layout slot (the right 360px aside).
`VerdictCard` moves into the rail.

## 4. Replay and failure

- `runs/[id]` (mode `"replay"`): rail renders all agents done, stored trace in
  the feed; the existing depth-cascade reveal of the graph stays. No protocol
  change needed — replay never consumed SSE.
- Agent error: its card turns red and shows the message; the existing top
  banner stays.
- Dropped stream / no terminal event: unchanged (`status: failed`).

## 5. Testing

- `stream.ts` reducer: unit tests for each new event type (append, patch,
  dedupe, cycles from tracer done data).
- `bfs.ts`: fake `fetchWorks` → assert `graph-delta` batches match committed
  nodes/edges (no dupes, anchors first).
- Router: stub ports emitting deltas → assert SSE order (`accepted` →
  `claim-resolved` → deltas/trace → `done`) and that persisted state contains
  no delta events.
- Existing port/stub tests updated for the widened signatures.

## Cost

Zero additional LLM calls — deltas carry data already in memory. Slightly
more SSE bytes per run (graph nodes streamed once each, small).

## Out of scope

- Changing BFS/agent logic or budgets.
- Persisting delta events or replaying them from the DB.
- Mobile layout for the run view.
