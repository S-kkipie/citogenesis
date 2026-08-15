# Citogenesis — Frontend Design (Part 3)

**Date:** 2026-08-15
**Status:** Approved in brainstorm session (design decisions locked)
**Workstream:** Part 3 — Frontend (`feat/frontend`)
**Parent specs:**
[stack-architecture-design](./2026-08-15-stack-architecture-design.md) (stack
LOCKED: Next 16 + Elysia/Eden + react-flow, clinical light theme is a Part-3
choice) and
[parallel-plan](../coordination/2026-08-15-parallel-plan.md) (Part 3 scope +
file ownership).

This spec covers only what the judges see. It does not re-litigate the stack,
the agent pipeline, or the data contracts — those are owned upstream and
consumed here as given.

## 0. Scope & ownership

**Owns (only these paths):**

- `src/core/run/client/**` — pure, browser-safe, no server deps, no React:
  derivation + stream-reduction logic.
- `src/app/**` except `src/app/api/**` — the pages and feature components.

**Reuses (does not modify):** `src/frontend/lib/eden.ts` (`useElysia`,
`apiClient`, `EdenProvider`), `src/frontend/components/ui/*` (shadcn
primitives), `src/frontend/providers/theme-provider.tsx`,
`src/app/globals.css` design tokens, `@xyflow/react ^12` (installed).

**Consumes (contracts, read-only, owned by orchestrator in
`src/core/run/domain/`):** `RunInput`, `RunState`, `CitationGraph` /
`CitationNode` / `CitationEdge`, `Pathogen`, `DriftFinding`, `Verdict`,
`RunError`, `TraceEvent`, `RunSseEvent`, `RunRecord`. A change to any of these
is requested from the orchestrator, never edited here.

## 1. Experience shape (decided)

**Mission-control dashboard** — one screen, 16:9, no page scroll, everything
visible at once so the 3-minute demo is a single continuous shot (working-demo
rubric, 20%).

```
┌──────────────────────────────────────────────────────────┐
│ InputBar: [claim ▾] ____________________________  [Run]   │
│           example-claim chips (one-click demo start)       │
├─────────────────────────────────────────┬─────────────────┤
│                                         │ VerdictCard      │
│            CitationGraph                │  ● LOW  score 22 │
│         (react-flow canvas,             │  pathogens…      │
│          pan / zoom / click)            │  coverage 38/40  │
│                                         ├─────────────────┤
│     ○──○──○                             │ PipelineBar      │
│        ╲ │                              │  ✓T→✓P→⣾D·V      │
│         ●◀─┘  (cycle, red)              ├─────────────────┤
│                                         │ AuditLog         │
│                                         │  ▾ Tracer …      │
│                                         │  ▾ Primacy …     │
│                                         │  ▸ Drift running │
└─────────────────────────────────────────┴─────────────────┘
   click a red-solid origin → DriftPanel slides over the rail
```

## 2. Visual language (decided)

**Aesthetic: clinical lab.** Light, near-white, ink-on-paper, restrained color
used only for signal — evokes a diagnostic / peer-review report. Flags stand
out by the scarcity of color around them.

Palette (mapped to CSS tokens in `globals.css`; values are the design intent,
not necessarily new tokens):

| Token | Hex | Use |
|---|---|---|
| bg | `#FBFCFD` | canvas |
| ink | `#1A1F26` | text |
| flagged (red) | `#CF222E` | confirmed pathogen on a node/edge |
| caution (amber) | `#9A6700` | soft flag / degraded confidence |
| healthy (green) | `#1A7F37` | clean primary-source origin (the good outcome) |
| neutral (slate) | `#57606A` | ordinary intermediate node, normal edges |

### 2.1 Node encoding — two orthogonal signals

Each node carries **primacy** and **pathogen severity**, which are orthogonal,
so they use different visual channels (never both on color):

- **shape = primacy:** solid disc = `primary`; hollow ring = `secondary`;
  dashed ring = `unknown` **or** `fetchStatus: "unresolved"`.
- **color = severity (derived — see §3):** red = flagged; amber = caution;
  green = healthy primary origin; slate = neutral.

Reading examples: red **solid** = flagged primary origin (worst case, a fragile
root everyone leans on); slate **ring** = clean secondary (normal chain link);
red **ring** = flagged review-only node; dashed = the tracer couldn't resolve
it (counts against coverage, not against the claim).

### 2.2 Edge encoding

- Normal citation edge (`from` cites `to`): thin slate arrow.
- **Cycle edge** (both endpoints appear in the same `state.cycles[k]`): thick
  red, animated dashes — pathogen `circular-support`, visible without reading a
  label.
- Support path from anchors down to an origin candidate: slightly emphasized
  weight so the eye follows the chain to its root.

### 2.3 Legend

Always-visible compact legend (shape key + color key + cycle-edge key) pinned in
a graph corner. Non-negotiable for an unfamiliar judge to read the graph in the
first five seconds of the video.

## 3. Derivation layer (`src/core/run/client/`) — the crux

Pathogens are **run-level** in the contracts (`Verdict.pathogens`,
`state.cycles`, `state.driftFindings`, `state.originCandidates`,
`node.isRetracted`). A `CitationNode` has no pathogen field. The frontend must
therefore **derive** each node's visual state. This derivation is the heart of
Part 3 and lives in pure, unit-testable functions with no React and no server
imports.

### 3.1 `deriveGraphView(state: RunState): GraphView`

Pure. Maps a `RunState` (or partial state) to react-flow inputs plus per-node
status:

```ts
type NodeSeverity = "flagged" | "caution" | "healthy" | "neutral";
type NodeShape = "solid" | "ring" | "dashed";

interface NodeView {
  node: CitationNode;
  shape: NodeShape;          // from primacy + fetchStatus
  severity: NodeSeverity;    // derived, see rules
  isOrigin: boolean;         // in state.originCandidates
  inCycle: boolean;          // in any state.cycles[]
  drift?: DriftFinding;      // matched by workId
  pathogens: Pathogen[];     // which run-level pathogens touch this node
}

interface EdgeView {
  edge: CitationEdge;
  kind: "citation" | "cycle" | "support-path";
}

interface GraphView {
  nodes: NodeView[];
  edges: EdgeView[];
  truncated: boolean;        // from graph.truncated → "budget hit" banner
}
```

**Severity rules (first match wins).** Whether a pathogen *exists* is decided
upstream (`Verdict.pathogens`); the frontend only maps each run-level pathogen
back to the node(s) it implicates. It never re-detects pathogens.

1. `flagged` — node in a `state.cycles[]` (implicates `circular-support`), OR a
   `driftFinding` with label `drifted`/`contradicted` (implicates
   `claim-drift`), OR `isRetracted`, OR an origin candidate when
   `Verdict.pathogens` includes `single-point-of-failure` (the funnel root).
2. `caution` — `driftFinding` label `partially-supported`, OR
   `fetchStatus: "unresolved"`, OR an origin candidate when `Verdict.pathogens`
   includes `no-primary-source`.
3. `healthy` — `primary` origin candidate with no flag (real evidence found).
4. `neutral` — everything else.

When the verdict is not yet available (mid-run partial state), only the
node-intrinsic rules apply (cycles, drift, retraction, fetch status); the
`single-point-of-failure` / `no-primary-source` colorings light up once the
`done` event delivers the verdict — which fits the scripted reveal order (§4.2).

**Shape rules:** `primary` → solid; `secondary` → ring; `unknown` or
`fetchStatus: "unresolved"` → dashed.

`pathogens` per node is computed by mapping the run-level pathogen list back to
the nodes that caused it, so hovering a flagged node explains *which* pathogen
and *why*.

### 3.2 `streamReducer(view, event: RunSseEvent): LiveView`

Pure reducer folding the SSE event stream into a live view-model:

```ts
type AgentStatus = "idle" | "running" | "done" | "recovered" | "error";

interface LiveView {
  runId?: string;
  agents: Record<AgentName, AgentStatus>;  // drives PipelineBar
  trace: TraceEvent[];                      // drives AuditLog
  terminal?: "done" | "failed";
  verdict?: Verdict;                        // from the done event
  failureMessage?: string;                  // from the failed event
}
```

`accepted` → set `runId`. `trace` → append event; flip that agent to
`running`/`done` from its `phase` (`start`→running, `handoff`/`done`→done,
`recovery`→recovered, `error`→error). `done` → terminal + verdict. `failed` →
terminal + message. Pure and deterministic → tested against fixed event
sequences.

## 4. Data flow

### 4.1 Live run

1. `InputBar` builds a `RunInput` (discriminated by door — §5).
2. `useRunStream(input)` (thin React hook in `src/app`, wrapping the pure
   `streamReducer`) POSTs `/api/v1/runs` via Eden and consumes the response as
   an `AsyncGenerator<RunSseEvent>`.
3. Each event → `streamReducer` → re-render. `PipelineBar` + `AuditLog` animate
   live; this is the **agent-collaboration story made visible** (25% rubric).
4. On `done`: fetch `GET /api/v1/runs/:id` → full `RunState` →
   `deriveGraphView` → render graph + verdict + drift.

**Why the graph arrives at `done`, not incrementally:** `RunSseEvent` streams
`accepted`, `trace`, `done{verdict}`, `failed`. Trace `data` is contracted as
"keep it small" — no guaranteed node/edge batches. So the full graph comes from
the stored `RunState` at completion.

### 4.2 Scripted graph reveal (decided)

Because full state lands at once, the graph plays a **scripted entrance** that
reads as "built live" on video, with zero contract dependency:

1. Nodes cascade in ordered by `depth` (anchor → roots).
2. Pathogen flags light up (neutral → severity colors).
3. Cycle edges begin their red pulse.
4. `DriftPanel` auto-opens on the worst origin (contradicted > drifted).

A **Replay** button re-runs the reveal from stored state — for demo retakes and
for the permalink page.

> **Future enhancement (not built now, YAGNI):** true incremental building
> would need a contract addition — `trace` progress events carrying
> `{nodes, edges}` deltas. Looks ~identical on video, so deferred. If pursued,
> request the contract change from the orchestrator; `deriveGraphView` already
> accepts partial state, so only the wiring changes.

### 4.3 Permalink `/runs/[id]`

Server component fetches `RunRecord` (`GET /api/v1/runs/:id`), renders the same
`<RunDashboard>` in **replay** mode: graph fully drawn, trace replayed
statically, Replay button available. This is the shareable "auditable result".

### 4.4 Shared render layer

One `<RunDashboard state={RunState} live={LiveView} mode="live" | "replay">`
component powers both the audit page and the permalink page, so the two never
drift apart. Live mode drives from `useRunStream` + the fetched state; replay
mode drives purely from the fetched `RunRecord`.

## 5. Input doors (`RunInput`)

Door selector maps 1:1 to the `RunInput` discriminated union:

- **claim** → `{ kind: "claim", text }` (min 8 chars). Free-text box.
- **paper** → `{ kind: "paper", id }` (min 3 chars). arXiv id / DOI / OpenAlex
  id; a hint line lists accepted formats.
- **wikipedia** → `{ kind: "wikipedia", url, statement? }`. URL box + optional
  statement box ("which sentence's `[n]` refs to audit").

Example-claim chips prefill a known flagship claim per door → one-click demo
start, no typing on camera. Client-side validation mirrors the Zod min-length
rules before POST; server remains the source of truth.

## 6. Error handling

- SSE `failed` → failure banner with `message`; keep the partial `AuditLog`
  (shows how far the pipeline got). No graph.
- `RunError[]` on the state, `recovered: true` → amber recovery line in the
  `AuditLog` (from `trace` `recovery` phase); `recovered: false` → fatal,
  surfaces as the failure banner.
- Generator ends with no `done`/`failed` (dropped stream) → "stream
  interrupted" notice → fallback `GET /runs/:id`; if that has a terminal
  status, render it; else offer Re-run.
- `fetchStatus: "unresolved"` nodes → dashed/greyed; `VerdictCard` shows
  `coverage.resolved / coverage.total` ("38/40 resolved") so partial data reads
  as honest, not broken.
- `graph.truncated` → small "BFS budget reached" chip on the graph (expected,
  not an error).
- Empty/tiny graph → still renders; `VerdictCard.prose` carries the explanation.

## 7. Testing

- **Pure logic (primary coverage):** `deriveGraphView` and `streamReducer`
  unit-tested against fixture `RunState` objects and fixed `RunSseEvent`
  sequences — cycles → red edges, drift → flagged nodes, primacy → shapes,
  unresolved → dashed, event order → pipeline statuses. Deterministic, fast,
  offline.
- **Fixtures:** a committed `RunRecord` JSON (mirroring the stub pipeline's
  output shape) drives the permalink page and component tests with no network.
- **Components (smoke, RTL):** `VerdictCard` renders confidence/score/pathogens/
  coverage; `DriftPanel` renders the evidence quote + label; `InputBar` builds
  the correct `RunInput` per door.
- No frontend e2e: the stub pipeline runs end-to-end locally today, used for
  manual demo rehearsal.

## 8. Demo-recording friendliness (explicit 20% concern)

- Scripted reveal (§4.2) + Replay button for clean retakes.
- Clinical light theme, large node labels, always-on legend.
- Prefilled flagship-claim chips → instant start, no typing on camera.
- Single screen at 1080p 16:9, zero scroll, right rail sized so verdict +
  pipeline + top of the log are visible without interaction.

## 9. Build order (feeds writing-plans)

1. `src/core/run/client/`: `deriveGraphView` + `streamReducer` + fixtures +
   unit tests (pure, no UI — provable first).
2. `RunDashboard` shell + `CitationGraph` (react-flow) rendering a fixture
   `RunState` (static, no live run yet).
3. `VerdictCard`, `PipelineBar`, `AuditLog`, `Legend` off the same fixture.
4. `DriftPanel` + node-click wiring.
5. `useRunStream` + `InputBar` → live run against the stub pipeline.
6. Scripted reveal animation.
7. `/runs/[id]` permalink (server fetch → replay mode).
8. Example-claim chips + demo polish pass.

## 10. Out of scope (this spec)

- Which flagship claim(s) to demo (demo-content decision, made at demo prep).
- The stub-vs-real pipeline behavior (upstream; frontend renders whatever the
  contracts return).
- Any change to `src/frontend/**`, `src/app/api/**`, or the domain contracts.
