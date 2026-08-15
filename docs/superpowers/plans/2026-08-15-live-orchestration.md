# Live Orchestration View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream agent activity and citation-graph growth live over SSE and render it in a hybrid layout: orchestration rail (left) + live graph canvas (right).

**Architecture:** LangGraph `streamMode: ["values", "custom"]` lets node bodies push chunks mid-execution via `config.writer`. Trace events keep being collected for persistence AND stream live; a new ephemeral `DeltaEvent` channel carries graph increments (never persisted — `state.graph` is the persisted copy). The client folds deltas into a partial `RunState`, so `deriveGraphView` and the Sigma canvas are reused unchanged. The canvas is refactored to sync a long-lived graphology instance instead of remounting Sigma per change.

**Tech Stack:** Next.js (App Router), Elysia SSE, LangGraph 1.4.10, zod v4, Sigma v3 + graphology, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-live-orchestration-design.md`

## Global Constraints

- LangGraph is pinned at 1.4.10 (already latest); `config.writer` and `streamMode: "custom"` are available.
- Delta events are ephemeral: streamed only, NEVER written to `runs.state` or the trace.
- `TRACE_BUDGET` values (`maxDepth: 3, maxRefsPerNode: 25, maxNodes: 200`) must not change.
- zod is v4 (`z.iso.datetime()`, `z.url()` style APIs).
- Code style: biome, 4-space indent, double quotes. Run `pnpm check` (biome), `pnpm typecheck` (tsc), `pnpm test` (vitest run).
- Existing SSE event types (`accepted`/`trace`/`done`/`failed`) must keep their exact shapes — the replay page and old clients rely on them.
- This is Next.js with breaking changes vs training data — if you touch Next-specific APIs beyond what this plan shows, read `node_modules/next/dist/docs/` first. (This plan's tasks stay within plain React + existing patterns.)

## File Structure

| File | Responsibility |
|---|---|
| `src/core/run/domain/delta.ts` (new) | `DeltaEvent` zod schemas + `DeltaEmit` type — the ephemeral live channel |
| `src/core/run/domain/api.ts` | `runSseEventSchema` gains the delta variants |
| `src/core/run/domain/ports.ts` | Ports gain optional trailing `emitDelta?: DeltaEmit` |
| `src/core/run/server/graph.ts` | `channels(config)` wires emit/emitDelta to `config.writer`; exports `LiveChunk` |
| `src/core/run/server/stubs.ts` | Stubs emit sample deltas (feeds wiring tests) |
| `src/core/run/server/api/router.ts` | Dual stream mode; forwards custom chunks as SSE immediately |
| `src/core/citations/trace/bfs.ts` | Emits `graph-delta` per expansion + `cycles` |
| `src/core/citations/resolve/index.ts` | Emits `claim-resolved` |
| `src/core/citations/index.ts` | Wrappers pass `emitDelta` through |
| `src/core/agents/primacy/judge-primacy.ts` | Emits `nodes-patch` batches + `origins` |
| `src/core/agents/drift/audit-drift.ts` | Emits `drift-finding` per origin |
| `src/core/run/client/stream.ts` | `LiveView.partial` + reducer cases + `liveRunState()` |
| `src/app/(app)/audit/_lib/graph-sync.ts` (new) | Pure graphology-instance sync from a `GraphView` (testable headless) |
| `src/app/(app)/audit/_components/CitationGraph.tsx` | Renderer created once; syncs via graph-sync; `cascade` prop |
| `src/app/(app)/audit/_components/OrchestraRail.tsx` (new) | Agent cards + connectors + handoff packets + embedded verdict |
| `src/app/(app)/audit/_components/TraceFeed.tsx` (new) | Chronological auto-scrolling trace feed |
| `src/app/(app)/audit/_components/VerdictCard.tsx` | Gains `embedded` variant |
| `src/app/(app)/audit/_components/RunDashboard.tsx` | New grid `[320px_1fr]`, rail left, placeholder states |
| `src/app/(app)/audit/_hooks/useRunStream.ts` | Returns live partial state until final GET lands |
| `src/app/(app)/audit/audit.css` | Rail/connector/beam/packet styles |
| DELETE `_components/PipelineBar.tsx`, `_components/AuditLog.tsx` | Replaced by OrchestraRail + TraceFeed |

---

### Task 1: Delta event domain types

**Files:**
- Create: `src/core/run/domain/delta.ts`
- Modify: `src/core/run/domain/api.ts`
- Modify: `src/core/run/domain/index.ts`
- Test: `src/core/run/domain/__tests__/delta.test.ts`

**Interfaces:**
- Produces: `DeltaEvent` (discriminated union of 6 types: `claim-resolved`, `graph-delta`, `nodes-patch`, `origins`, `cycles`, `drift-finding`), `DeltaEmit = (event: DeltaEvent) => void`, `deltaEventSchema`, `deltaEventOptions` (the option tuple, reused by `runSseEventSchema`). `RunSseEvent` now includes every `DeltaEvent` variant.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/run/domain/__tests__/delta.test.ts
import { describe, expect, it } from "vitest";
import { deltaEventSchema } from "../delta";
import { runSseEventSchema } from "../api";

const node = {
    id: "W1",
    title: "T",
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: null,
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth: 0,
    source: "openalex",
    fetchStatus: "resolved",
};

describe("deltaEventSchema", () => {
    it("parses every delta variant", () => {
        const events = [
            { type: "claim-resolved", claim: "c", anchors: ["W1"] },
            {
                type: "graph-delta",
                nodes: [node],
                edges: [{ from: "W1", to: "W2" }],
            },
            {
                type: "nodes-patch",
                patches: [
                    {
                        id: "W1",
                        primacy: { label: "primary", method: "heuristic" },
                    },
                ],
            },
            { type: "origins", ids: ["W1"] },
            { type: "cycles", cycles: [["W1", "W2"]] },
            {
                type: "drift-finding",
                finding: {
                    workId: "W1",
                    label: "drifted",
                    evidenceQuote: null,
                    explanation: "e",
                    basis: "abstract",
                },
            },
        ];
        for (const e of events) {
            expect(deltaEventSchema.safeParse(e).success).toBe(true);
        }
    });

    it("rejects unknown types and malformed payloads", () => {
        expect(deltaEventSchema.safeParse({ type: "nope" }).success).toBe(
            false,
        );
        expect(
            deltaEventSchema.safeParse({ type: "origins", ids: ["notAnId"] })
                .success,
        ).toBe(false);
    });

    it("every delta variant is a valid RunSseEvent", () => {
        expect(
            runSseEventSchema.safeParse({
                type: "graph-delta",
                nodes: [],
                edges: [],
            }).success,
        ).toBe(true);
        expect(
            runSseEventSchema.safeParse({
                type: "claim-resolved",
                claim: "c",
                anchors: [],
            }).success,
        ).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/run/domain/__tests__/delta.test.ts`
Expected: FAIL — `Cannot find module '../delta'`

- [ ] **Step 3: Create `src/core/run/domain/delta.ts`**

```ts
import { z } from "zod";
import {
    citationEdgeSchema,
    citationNodeSchema,
    primacySchema,
    workIdSchema,
} from "./graph";
import { driftFindingSchema } from "./state";

/**
 * Ephemeral live-view events. Streamed over SSE while a run executes so the
 * UI can grow the graph and animate agent activity in real time. NEVER
 * persisted — the graph itself is persisted in `RunState.graph`, and the
 * auditable record is the trace.
 */
export const deltaEventOptions = [
    z.object({
        type: z.literal("claim-resolved"),
        claim: z.string(),
        anchors: z.array(workIdSchema),
    }),
    z.object({
        type: z.literal("graph-delta"),
        nodes: z.array(citationNodeSchema),
        edges: z.array(citationEdgeSchema),
    }),
    z.object({
        type: z.literal("nodes-patch"),
        patches: z.array(
            z.object({ id: workIdSchema, primacy: primacySchema }),
        ),
    }),
    z.object({ type: z.literal("origins"), ids: z.array(workIdSchema) }),
    z.object({
        type: z.literal("cycles"),
        cycles: z.array(z.array(workIdSchema)),
    }),
    z.object({
        type: z.literal("drift-finding"),
        finding: driftFindingSchema,
    }),
] as const;

export const deltaEventSchema = z.discriminatedUnion("type", [
    ...deltaEventOptions,
]);
export type DeltaEvent = z.infer<typeof deltaEventSchema>;

/** Ports call this (when given) to push live view updates. Fire-and-forget. */
export type DeltaEmit = (event: DeltaEvent) => void;
```

- [ ] **Step 4: Extend `runSseEventSchema` in `src/core/run/domain/api.ts`**

Replace the `runSseEventSchema` declaration with:

```ts
import { deltaEventOptions } from "./delta";

export const runSseEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("accepted"), runId: z.string() }),
    z.object({ type: z.literal("trace"), event: traceEventSchema }),
    z.object({
        type: z.literal("done"),
        runId: z.string(),
        verdict: verdictSchema,
    }),
    z.object({
        type: z.literal("failed"),
        runId: z.string(),
        message: z.string(),
    }),
    ...deltaEventOptions,
]);
```

(The `import` goes at the top of the file with the other relative imports.)

- [ ] **Step 5: Export from `src/core/run/domain/index.ts`**

```ts
export * from "./api";
export * from "./delta";
export * from "./graph";
export * from "./ports";
export * from "./state";
export * from "./trace";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run src/core/run/domain/__tests__/delta.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm typecheck
git add src/core/run/domain
git commit -m "feat: ephemeral DeltaEvent channel for live run view"
```

---

### Task 2: Ports accept emitDelta; stubs emit sample deltas

**Files:**
- Modify: `src/core/run/domain/ports.ts`
- Modify: `src/core/run/server/stubs.ts`

**Interfaces:**
- Consumes: `DeltaEmit`, `DeltaEvent` from Task 1.
- Produces: `ResolveInput`, `TraceChain`, `JudgePrimacy`, `AuditDrift` each gain an optional trailing parameter `emitDelta?: DeltaEmit`. (`WriteVerdict` is unchanged — the verdict arrives via the terminal `done` SSE event.) Stubs now emit: `claim-resolved` (resolveInputStub), `graph-delta` (traceChainStub), `nodes-patch` + `origins` (judgePrimacyStub).

- [ ] **Step 1: Widen the four port types in `src/core/run/domain/ports.ts`**

Add to the imports: `import type { DeltaEmit } from "./delta";` and change the signatures:

```ts
/** Door A/B/C → normalized claim + BFS roots. */
export type ResolveInput = (
    input: RunInput,
    emit: TraceEmit,
    emitDelta?: DeltaEmit,
) => Promise<{ claim: string; anchors: WorkId[]; errors: RunError[] }>;

/** BFS backwards via referenced_works, within budget. Detects cycles. */
export type TraceChain = (
    anchors: WorkId[],
    budget: TraceBudget,
    emit: TraceEmit,
    emitDelta?: DeltaEmit,
) => Promise<{
    graph: CitationGraph;
    cycles: WorkId[][];
    errors: RunError[];
}>;

/** Label every resolved node primary/secondary/unknown; pick chain roots. */
export type JudgePrimacy = (
    graph: CitationGraph,
    emit: TraceEmit,
    emitDelta?: DeltaEmit,
) => Promise<{
    nodes: CitationNode[];
    originCandidates: WorkId[];
    errors: RunError[];
}>;

/** Compare origin full-text (or abstract fallback) against the claim. */
export type AuditDrift = (
    claim: string,
    origins: CitationNode[],
    emit: TraceEmit,
    emitDelta?: DeltaEmit,
) => Promise<{ findings: DriftFinding[]; errors: RunError[] }>;
```

Keep the doc comments that already sit above each type; only the parameter
lists change. Existing implementations stay assignable (fewer params is fine
in TS), so nothing else breaks yet.

- [ ] **Step 2: Make stubs emit deltas in `src/core/run/server/stubs.ts`**

Update the three stubs (leave `auditDriftStub` and `writeVerdictStub` bodies as they are, but add the `emitDelta` parameter name to `auditDriftStub` as `_emitDelta` is NOT needed — optional params simply aren't declared where unused):

```ts
export const resolveInputStub: ResolveInput = async (
    input,
    emit,
    emitDelta,
) => {
    emit({
        agent: "input-adapter",
        phase: "done",
        summary: `STUB: anchored input kind=${input.kind}`,
    });
    const claim = input.kind === "claim" ? input.text : "stub claim";
    emitDelta?.({ type: "claim-resolved", claim, anchors: ["W0"] });
    return { claim, anchors: ["W0"], errors: [] };
};
```

In `traceChainStub`, add the parameter and emit the stub graph as a delta
before the `return`:

```ts
export const traceChainStub: TraceChain = async (
    anchors,
    budget,
    emit,
    emitDelta,
) => {
    // ...existing emit({...}) unchanged...
    const graph = {
        /* the existing inline graph object, unchanged */
    };
    emitDelta?.({ type: "graph-delta", nodes: graph.nodes, edges: graph.edges });
    return { graph, cycles: [], errors: [] };
};
```

(Concretely: lift the existing object literal currently inside `return { graph: {...} }` into a `const graph`, emit it, then `return { graph, cycles: [], errors: [] }`.)

In `judgePrimacyStub`:

```ts
export const judgePrimacyStub: JudgePrimacy = async (graph, emit, emitDelta) => {
    emit({
        agent: "primacy-judge",
        phase: "done",
        summary: `STUB: labeled ${graph.nodes.length} nodes`,
    });
    const nodes = graph.nodes.map((n) => ({
        ...n,
        primacy: {
            label: "unknown" as const,
            method: "heuristic" as const,
        },
    }));
    const originCandidates = nodes.slice(0, 1).map((n) => n.id);
    emitDelta?.({
        type: "nodes-patch",
        patches: nodes.map((n) => ({ id: n.id, primacy: n.primacy })),
    });
    emitDelta?.({ type: "origins", ids: originCandidates });
    return { nodes, originCandidates, errors: [] };
};
```

- [ ] **Step 3: Verify existing tests still pass + typecheck**

Run: `pnpm typecheck && pnpm exec vitest run src/core/run src/core/agents/__tests__/ports.test.ts`
Expected: PASS — signatures are backward compatible.

- [ ] **Step 4: Commit**

```bash
git add src/core/run/domain/ports.ts src/core/run/server/stubs.ts
git commit -m "feat: ports accept optional emitDelta; stubs emit sample deltas"
```

---

### Task 3: graph.ts streams via config.writer

**Files:**
- Modify: `src/core/run/server/graph.ts`
- Test: `src/core/run/server/__tests__/graph.test.ts` (add a test)

**Interfaces:**
- Consumes: widened ports (Task 2), `DeltaEmit`/`DeltaEvent` (Task 1).
- Produces: `export type LiveChunk = { kind: "trace"; event: TraceEvent } | { kind: "delta"; event: DeltaEvent }` — the payload shape pushed through `config.writer` and consumed by the router (Task 4). Node bodies now take `(state, config)`.

- [ ] **Step 1: Write the failing test** (append to `src/core/run/server/__tests__/graph.test.ts`)

```ts
import type { LiveChunk } from "../graph";

it("streams trace and delta chunks live via custom mode", async () => {
    const graph = buildRunGraph(stubPorts);
    const collected: Array<[string, unknown]> = [];
    const stream = await graph.stream(
        { input: { kind: "claim", text: "spinach is rich in iron" } },
        { streamMode: ["values", "custom"] },
    );
    for await (const chunk of stream) {
        collected.push(chunk as [string, unknown]);
    }

    const custom = collected
        .filter(([mode]) => mode === "custom")
        .map(([, c]) => c as LiveChunk);
    // trace events flow through the live channel...
    expect(custom.filter((c) => c.kind === "trace").length).toBeGreaterThan(0);
    // ...and so do the stub deltas
    const deltaTypes = custom
        .filter((c) => c.kind === "delta")
        .map((c) => (c as Extract<LiveChunk, { kind: "delta" }>).event.type);
    expect(deltaTypes).toContain("claim-resolved");
    expect(deltaTypes).toContain("graph-delta");
    expect(deltaTypes).toContain("nodes-patch");
    expect(deltaTypes).toContain("origins");

    // values mode still carries the final persistable state, delta-free
    const values = collected.filter(([mode]) => mode === "values");
    const final = values.at(-1)?.[1] as { verdict: unknown; trace: unknown[] };
    expect(final.verdict).not.toBeNull();
    expect(final.trace.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/run/server/__tests__/graph.test.ts`
Expected: FAIL — no `LiveChunk` export; custom chunks empty (writer never called).

- [ ] **Step 3: Wire writer channels in `src/core/run/server/graph.ts`**

Add imports: `LangGraphRunnableConfig` type from `@langchain/langgraph`, and `DeltaEmit`/`DeltaEvent` types from `@/core/run/domain`. Replace the `collector` helper with:

```ts
/** The payload shape pushed through LangGraph's custom stream channel. */
export type LiveChunk =
    | { kind: "trace"; event: TraceEvent }
    | { kind: "delta"; event: DeltaEvent };

/**
 * Per-node channels. Trace events are BOTH collected (returned as a state
 * update → persisted) and pushed to the live stream. Delta events are
 * live-only: they exist so the UI can render mid-run, and are never stored.
 */
const channels = (
    config: LangGraphRunnableConfig,
): { events: TraceEvent[]; emit: TraceEmit; emitDelta: DeltaEmit } => {
    const events: TraceEvent[] = [];
    const emit: TraceEmit = (event) => {
        const stamped = { ...event, ts: new Date().toISOString() };
        events.push(stamped);
        config.writer?.({ kind: "trace", event: stamped } satisfies LiveChunk);
    };
    const emitDelta: DeltaEmit = (event) => {
        config.writer?.({ kind: "delta", event } satisfies LiveChunk);
    };
    return { events, emit, emitDelta };
};
```

Then update every node body to take `config` and pass `emitDelta` through, e.g.:

```ts
.addNode("input-adapter", async (state, config) => {
    const { events, emit, emitDelta } = channels(config);
    const { claim, anchors, errors } = await (
        await port("resolveInput")
    )(state.input, emit, emitDelta);
    return { claim, anchors, trace: events, errors };
})
.addNode("chain-tracer", async (state, config) => {
    const { events, emit, emitDelta } = channels(config);
    const { graph, cycles, errors } = await (await port("traceChain"))(
        state.anchors,
        TRACE_BUDGET,
        emit,
        emitDelta,
    );
    return { graph, cycles, trace: events, errors };
})
.addNode("primacy-judge", async (state, config) => {
    const { events, emit, emitDelta } = channels(config);
    const { nodes, originCandidates, errors } = await (
        await port("judgePrimacy")
    )(state.graph, emit, emitDelta);
    return {
        graph: { ...state.graph, nodes },
        originCandidates,
        trace: events,
        errors,
    };
})
.addNode("drift-auditor", async (state, config) => {
    const { events, emit, emitDelta } = channels(config);
    const byId = new Map(state.graph.nodes.map((n) => [n.id, n]));
    const origins = state.originCandidates
        .map((id) => byId.get(id))
        .filter((n) => n !== undefined);
    const { findings, errors } = await (await port("auditDrift"))(
        state.claim,
        origins,
        emit,
        emitDelta,
    );
    return { driftFindings: findings, trace: events, errors };
})
.addNode("verdict-writer", async (state, config) => {
    const { events, emit } = channels(config);
    const verdict = await (await port("writeVerdict"))(
        {
            claim: state.claim,
            graph: state.graph,
            cycles: state.cycles,
            driftFindings: state.driftFindings,
            errors: state.errors,
        },
        emit,
    );
    return { verdict, trace: events };
})
```

If tsc rejects destructuring `{ events, emit }` when `emitDelta` is unused in
`verdict-writer`, that's fine as written — only two of the three are pulled.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/core/run/server/__tests__/graph.test.ts`
Expected: PASS (3 tests — the 2 existing wiring tests must still pass).

- [ ] **Step 5: Commit**

```bash
git add src/core/run/server/graph.ts src/core/run/server/__tests__/graph.test.ts
git commit -m "feat: run graph streams trace + deltas via custom writer"
```

---

### Task 4: Router forwards live chunks over SSE

**Files:**
- Modify: `src/core/run/server/api/router.ts`

**Interfaces:**
- Consumes: `LiveChunk` from Task 3; `DeltaEvent` variants are valid `RunSseEvent`s (Task 1).
- Produces: `POST /api/v1/runs` SSE order becomes `accepted` → interleaved `trace`/delta events as they happen → `done`|`failed`. No new endpoint shape.

- [ ] **Step 1: Replace the stream loop in `router.ts`**

Add `LiveChunk` to the import from `../graph` (it's a type import) and change the try block's streaming section:

```ts
import { buildRunGraph, type LiveChunk } from "../graph";
```

```ts
const graph = buildRunGraph();
let finalState: RunState | undefined;

const stream = await graph.stream(
    { input: body },
    { streamMode: ["values", "custom"] },
);
for await (const chunk of stream as AsyncIterable<[string, unknown]>) {
    const [mode, payload] = chunk;
    if (mode === "custom") {
        const live = payload as LiveChunk;
        yield event(
            live.kind === "trace"
                ? { type: "trace", event: live.event }
                : live.event,
        );
    } else if (mode === "values") {
        finalState = payload as RunState;
    }
}
```

Delete the `let emitted = 0;` declaration and the old `snapshot.trace.slice(emitted)` loop — trace now arrives exclusively through the custom channel. Everything after the loop (`if (!finalState?.verdict) ...`, DB update, `done`/`failed` events) stays exactly as it is.

Note on the cast: with an array `streamMode`, LangGraph yields `[mode, payload]` tuples. If tsc already types the iterator as tuples, drop the `as AsyncIterable<[string, unknown]>` cast.

- [ ] **Step 2: Typecheck + full server tests**

Run: `pnpm typecheck && pnpm exec vitest run src/core/run`
Expected: PASS. (The router has no direct unit test — it needs a DB. Its behavior is covered by the Task 3 stream test plus manual verification in Task 13.)

- [ ] **Step 3: Commit**

```bash
git add src/core/run/server/api/router.ts
git commit -m "feat: SSE forwards live trace + delta chunks as they happen"
```

---

### Task 5: ChainTracer emits graph-delta and cycles

**Files:**
- Modify: `src/core/citations/trace/bfs.ts`
- Modify: `src/core/citations/index.ts`
- Test: `src/core/citations/trace/__tests__/bfs-deltas.test.ts`

**Interfaces:**
- Consumes: `DeltaEmit` (Task 1).
- Produces: `traceChainWith(anchors, budget, emit, fetchWorks, emitDelta?)` — new optional 5th param. Emits one `graph-delta` for the anchors, one per parent expansion, and one `cycles` event when cycles exist. The `traceChain` wrapper in `citations/index.ts` passes `emitDelta` through.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/citations/trace/__tests__/bfs-deltas.test.ts
import { describe, expect, it } from "vitest";
import type { CitationNode, DeltaEvent, WorkId } from "@/core/run/domain";
import type { FetchedWork } from "../../types";
import { type FetchWorksFn, traceChainWith } from "../bfs";

const node = (id: WorkId, depth = 0): CitationNode => ({
    id,
    title: `Paper ${id}`,
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: null,
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth,
    source: "openalex",
    fetchStatus: "resolved",
});

const fw = (id: WorkId, refs: WorkId[] = []): FetchedWork => ({
    node: node(id),
    referencedWorks: refs,
    topicIds: [],
});

const CORPUS: Record<string, FetchedWork> = {
    W1: fw("W1", ["W2", "W3"]),
    W2: fw("W2"),
    W3: fw("W3"),
};

const fetchWorks: FetchWorksFn = async (ids) => {
    const works = new Map(
        ids.filter((id) => id in CORPUS).map((id) => [id, CORPUS[id]]),
    );
    return { works, missing: ids.filter((id) => !(id in CORPUS)) };
};

const BUDGET = { maxDepth: 2, maxRefsPerNode: 5, maxNodes: 10 };

describe("traceChainWith deltas", () => {
    it("emits anchors first, then one graph-delta per expansion", async () => {
        const deltas: DeltaEvent[] = [];
        const { graph } = await traceChainWith(
            ["W1"],
            BUDGET,
            () => {},
            fetchWorks,
            (e) => deltas.push(e),
        );

        const graphDeltas = deltas.filter((d) => d.type === "graph-delta");
        expect(graphDeltas.length).toBe(2);
        // anchors land as the first delta, no edges yet
        expect(graphDeltas[0].nodes.map((n) => n.id)).toEqual(["W1"]);
        expect(graphDeltas[0].edges).toEqual([]);
        // W1's expansion: children + both edges in one batch
        expect(graphDeltas[1].nodes.map((n) => n.id).sort()).toEqual([
            "W2",
            "W3",
        ]);
        expect(graphDeltas[1].edges).toEqual([
            { from: "W1", to: "W2" },
            { from: "W1", to: "W3" },
        ]);
        // streamed nodes ≡ final graph nodes (nothing missing, no dupes)
        const streamed = graphDeltas.flatMap((d) => d.nodes.map((n) => n.id));
        expect(streamed.sort()).toEqual(
            graph.nodes.map((n) => n.id).sort(),
        );
        // no cycles in this corpus → no cycles event
        expect(deltas.some((d) => d.type === "cycles")).toBe(false);
    });

    it("emits a cycles event when the corpus has one", async () => {
        const cyclic: Record<string, FetchedWork> = {
            W1: fw("W1", ["W2"]),
            W2: fw("W2", ["W1"]),
        };
        const fetchCyclic: FetchWorksFn = async (ids) => ({
            works: new Map(
                ids.filter((id) => id in cyclic).map((id) => [id, cyclic[id]]),
            ),
            missing: [],
        });
        const deltas: DeltaEvent[] = [];
        await traceChainWith(["W1"], BUDGET, () => {}, fetchCyclic, (e) =>
            deltas.push(e),
        );
        const cycles = deltas.find((d) => d.type === "cycles");
        expect(cycles).toBeDefined();
        expect(cycles?.cycles.length).toBeGreaterThan(0);
    });

    it("still works with no emitDelta (param optional)", async () => {
        const { graph } = await traceChainWith(
            ["W1"],
            BUDGET,
            () => {},
            fetchWorks,
        );
        expect(graph.nodes.length).toBe(3);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/citations/trace/__tests__/bfs-deltas.test.ts`
Expected: FAIL — `traceChainWith` takes 4 args / no deltas emitted.

- [ ] **Step 3: Implement in `src/core/citations/trace/bfs.ts`**

Add `DeltaEmit` to the type imports (from `../../run/domain/delta` — follow the existing relative-import style of the file). Change the signature:

```ts
export async function traceChainWith(
    anchors: WorkId[],
    budget: TraceBudgetInput,
    emit: TraceEmit,
    fetchWorks: FetchWorksFn,
    emitDelta?: DeltaEmit,
): Promise<{ graph: CitationGraph; cycles: WorkId[][]; errors: RunError[] }> {
```

After the anchor commit loop (`for (const a of anchors) commit(a, 0);`), add:

```ts
const anchorNodes = anchors
    .map((a) => nodes.get(a))
    .filter((n) => n !== undefined);
if (anchorNodes.length > 0) {
    emitDelta?.({ type: "graph-delta", nodes: anchorNodes, edges: [] });
}
```

Inside the per-parent loop, batch the expansion. Replace the `for (const child of kept)` block with:

```ts
const batchNodes: CitationNode[] = [];
const batchEdges: CitationEdge[] = [];
for (const child of kept) {
    if (!nodes.has(child.id) && nodes.size >= budget.maxNodes) {
        truncated = true;
        continue;
    }
    const edge = { from: parentId, to: child.id };
    edges.push(edge);
    batchEdges.push(edge);
    if (nodes.has(child.id)) continue;
    commit(child.id, depth + 1);
    const committed = nodes.get(child.id);
    if (committed) batchNodes.push(committed);
    if (fetched.has(child.id)) next.push(child.id);
}
if (batchNodes.length > 0 || batchEdges.length > 0) {
    emitDelta?.({
        type: "graph-delta",
        nodes: batchNodes,
        edges: batchEdges,
    });
}
```

After `const cycles = findCycles(graph);`, add:

```ts
if (cycles.length > 0) {
    emitDelta?.({ type: "cycles", cycles });
}
```

- [ ] **Step 4: Pass emitDelta through the wrapper in `src/core/citations/index.ts`**

```ts
export const traceChain = ((
    anchors: Parameters<TraceChain>[0],
    budget: TraceBudgetInput,
    emit: Parameters<TraceChain>[2],
    emitDelta?: Parameters<TraceChain>[3],
) =>
    traceChainWith(
        anchors,
        budget,
        emit,
        (ids) => getWorks(ids, liveOpts),
        emitDelta,
    )) satisfies TraceChain;
```

- [ ] **Step 5: Run all citation tests**

Run: `pnpm exec vitest run src/core/citations`
Expected: PASS — new file green, existing `bfs.test.ts` untouched and green.

- [ ] **Step 6: Commit**

```bash
git add src/core/citations
git commit -m "feat: ChainTracer streams graph-delta batches and cycles"
```

---

### Task 6: Input adapter emits claim-resolved

**Files:**
- Modify: `src/core/citations/resolve/index.ts`
- Modify: `src/core/citations/index.ts`
- Test: `src/core/citations/resolve/__tests__/index.test.ts` (add a test)

**Interfaces:**
- Consumes: `DeltaEmit` (Task 1).
- Produces: `resolveInputWith(input, emit, opts, deps = {}, emitDelta?)` — new optional 5th param; emits exactly one `claim-resolved` right before the handoff trace event. The `resolveInput` wrapper passes it through.

- [ ] **Step 1: Write the failing test** (append inside the existing describe block, matching that file's existing fake-deps style — if its helpers differ, adapt the deps object to them):

```ts
it("emits a claim-resolved delta before handing off", async () => {
    const deltas: DeltaEvent[] = [];
    await resolveInputWith(
        { kind: "claim", text: "spinach is rich in iron" },
        () => {},
        {},
        {
            resolveClaim: (async () => ({
                anchors: ["W1"],
                errors: [],
            })) as ResolveDeps["resolveClaim"],
        },
        (e) => deltas.push(e),
    );
    expect(deltas).toEqual([
        {
            type: "claim-resolved",
            claim: "spinach is rich in iron",
            anchors: ["W1"],
        },
    ]);
});
```

(Import `DeltaEvent` from `@/core/run/domain` and `ResolveDeps` from `../index` at the top if not present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/citations/resolve/__tests__/index.test.ts`
Expected: FAIL — function takes 4 args.

- [ ] **Step 3: Implement**

In `src/core/citations/resolve/index.ts`, import `DeltaEmit` (type) alongside `TraceEmit`, widen the signature:

```ts
export async function resolveInputWith(
    input: RunInput,
    emit: TraceEmit,
    opts: OpenAlexOpts,
    deps: Partial<ResolveDeps> = {},
    emitDelta?: DeltaEmit,
): Promise<{ claim: string; anchors: WorkId[]; errors: RunError[] }> {
```

and just before the final `emit({ agent: "input-adapter", phase: "handoff", ... })`:

```ts
emitDelta?.({ type: "claim-resolved", claim, anchors });
```

In `src/core/citations/index.ts`:

```ts
export const resolveInput: ResolveInput = (input, emit, emitDelta) =>
    resolveInputWith(input, emit, liveOpts, {}, emitDelta);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/core/citations/resolve`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/citations
git commit -m "feat: input adapter emits claim-resolved delta"
```

---

### Task 7: PrimacyJudge emits nodes-patch batches and origins

**Files:**
- Modify: `src/core/agents/primacy/judge-primacy.ts`
- Test: `src/core/agents/primacy/__tests__/judge-primacy.test.ts` (add a test)

**Interfaces:**
- Consumes: `DeltaEmit` (Task 1); widened `JudgePrimacy` port (Task 2).
- Produces: the returned `JudgePrimacy` emits one `nodes-patch` covering all heuristic labels, one `nodes-patch` after every LLM batch (including failure→unknown labels), and one `origins` after `selectOrigins`.

- [ ] **Step 1: Write the failing test** (append to the existing test file, reusing its node/`makeJudgePrimacy` fake-call helpers; if its factory helpers differ, adapt — the assertions are the contract):

```ts
it("streams nodes-patch batches and origins as deltas", async () => {
    const deltas: DeltaEvent[] = [];
    const judge = makeJudgePrimacy(async () => ({
        data: {
            results: [
                { id: "W2", label: "primary", rationale: "has data" },
            ],
        },
    }));
    // W1 heuristically labelable (review → secondary), W2 ambiguous → LLM
    const graph = {
        nodes: [reviewNode("W1"), articleNode("W2")],
        edges: [{ from: "W1", to: "W2" }],
        truncated: false,
    };
    const result = await judge(graph, () => {}, (e) => deltas.push(e));

    const patches = deltas
        .filter((d) => d.type === "nodes-patch")
        .flatMap((d) => d.patches);
    // every resolved node's label was streamed exactly once
    expect(patches.map((p) => p.id).sort()).toEqual(["W1", "W2"]);
    const origins = deltas.find((d) => d.type === "origins");
    expect(origins?.ids).toEqual(result.originCandidates);
});
```

Here `reviewNode`/`articleNode` mean: a `CitationNode` whose `type` is
`"review"` (heuristics label it without the LLM) and `"article"` typed so the
heuristic returns null (goes to the LLM batch). Reuse the file's existing
node factory; if the existing factory produces types the heuristics resolve
differently, check `src/core/agents/primacy/heuristics.ts` for one type that
maps to a label and one that returns null, and use those two.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/agents/primacy/__tests__/judge-primacy.test.ts`
Expected: FAIL — no deltas emitted (param ignored).

- [ ] **Step 3: Implement in `judge-primacy.ts`**

The factory's returned function becomes `async (graph, emit, emitDelta) => {`.
Add a small helper above the return:

```ts
const patchesFor = (ns: CitationNode[]) =>
    ns.flatMap((n) =>
        n.primacy ? [{ id: n.id, primacy: n.primacy }] : [],
    );
```

After the heuristic pass's `emit({ ..."progress"... })` call, add:

```ts
const heuristicPatches = patchesFor(
    graph.nodes.map((n) => out.get(n.id)).filter((n) => n !== undefined),
);
if (heuristicPatches.length > 0) {
    emitDelta?.({ type: "nodes-patch", patches: heuristicPatches });
}
```

At the end of each LLM batch iteration (after the `try`/`catch`, still inside
the `for` loop), add:

```ts
const batchPatches = patchesFor(
    batch.map((n) => out.get(n.id)).filter((n) => n !== undefined),
);
if (batchPatches.length > 0) {
    emitDelta?.({ type: "nodes-patch", patches: batchPatches });
}
```

After `const originCandidates = selectOrigins({ ...graph, nodes });`, add:

```ts
emitDelta?.({ type: "origins", ids: originCandidates });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/core/agents/primacy`
Expected: PASS (existing tests too — they call the port with 2 args, still valid).

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/primacy
git commit -m "feat: PrimacyJudge streams label patches and origins"
```

---

### Task 8: DriftAuditor emits drift-finding

**Files:**
- Modify: `src/core/agents/drift/audit-drift.ts`
- Test: `src/core/agents/drift/__tests__/audit-drift.test.ts` (add a test)

**Interfaces:**
- Consumes: `DeltaEmit` (Task 1); widened `AuditDrift` port (Task 2).
- Produces: one `drift-finding` delta per successful origin audit, identical to the finding pushed into the returned array.

- [ ] **Step 1: Write the failing test** (append, reusing the file's fake `call`/`resolve` helpers; adapt names to the file's existing style):

```ts
it("streams each finding as a drift-finding delta", async () => {
    const deltas: DeltaEvent[] = [];
    const audit = makeAuditDrift(
        async () => ({
            data: {
                label: "drifted",
                evidenceQuote: "in mice only",
                explanation: "generalized beyond the model organism",
            },
        }),
        async () => ({ text: "abstract text", basis: "abstract" as const }),
    );
    const { findings } = await audit(
        "claim",
        [originNode("W9")],
        () => {},
        (e) => deltas.push(e),
    );
    const streamed = deltas.filter((d) => d.type === "drift-finding");
    expect(streamed.map((d) => d.finding)).toEqual(findings);
});
```

(`originNode` = the file's existing `CitationNode` factory.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/agents/drift/__tests__/audit-drift.test.ts`
Expected: FAIL — no deltas.

- [ ] **Step 3: Implement in `audit-drift.ts`**

Returned function becomes `async (claim, origins, emit, emitDelta) => {`.
Where the finding is pushed, capture and emit it:

```ts
const finding: DriftFinding = {
    workId: origin.id,
    label: data.label,
    evidenceQuote: data.evidenceQuote,
    explanation: data.explanation,
    basis: content.basis,
};
findings.push(finding);
emitDelta?.({ type: "drift-finding", finding });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/core/agents/drift`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/drift
git commit -m "feat: DriftAuditor streams findings as deltas"
```

---

### Task 9: Client stream reducer folds deltas into a partial RunState

**Files:**
- Modify: `src/core/run/client/stream.ts`
- Test: `src/core/run/client/__tests__/stream.test.ts` (add tests)

**Interfaces:**
- Consumes: `DeltaEvent` variants now inside `RunSseEvent` (Task 1).
- Produces:
  - `interface LivePartial { claim: string; anchors: WorkId[]; graph: { nodes: CitationNode[]; edges: CitationEdge[]; truncated: boolean }; cycles: WorkId[][]; originCandidates: WorkId[]; driftFindings: DriftFinding[] }`
  - `LiveView` gains `partial: LivePartial`; `initialLiveView()` seeds it empty.
  - `liveRunState(view: LiveView, input: RunInput): RunState | null` — null until the first node exists, otherwise a `RunState` assembled from the partial (verdict/trace from the view, `errors: []`).

- [ ] **Step 1: Write the failing tests** (append to `stream.test.ts`):

```ts
import type { CitationNode, RunInput } from "@/core/run/domain";
import { liveRunState } from "../stream";

const node = (id: string, depth = 0): CitationNode => ({
    id,
    title: `Paper ${id}`,
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: null,
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth,
    source: "openalex",
    fetchStatus: "resolved",
});

describe("streamReducer deltas", () => {
    it("accumulates graph-deltas, deduping nodes and edges", () => {
        const v = fold([
            {
                type: "graph-delta",
                nodes: [node("W1")],
                edges: [],
            },
            {
                type: "graph-delta",
                nodes: [node("W1"), node("W2", 1)],
                edges: [
                    { from: "W1", to: "W2" },
                    { from: "W1", to: "W2" },
                ],
            },
        ]);
        expect(v.partial.graph.nodes.map((n) => n.id)).toEqual(["W1", "W2"]);
        expect(v.partial.graph.edges).toEqual([{ from: "W1", to: "W2" }]);
    });

    it("patches primacy in place via nodes-patch", () => {
        const v = fold([
            { type: "graph-delta", nodes: [node("W1")], edges: [] },
            {
                type: "nodes-patch",
                patches: [
                    {
                        id: "W1",
                        primacy: { label: "primary", method: "heuristic" },
                    },
                ],
            },
        ]);
        expect(v.partial.graph.nodes[0].primacy?.label).toBe("primary");
    });

    it("records claim, origins, cycles and drift findings", () => {
        const finding = {
            workId: "W1",
            label: "drifted" as const,
            evidenceQuote: null,
            explanation: "e",
            basis: "abstract" as const,
        };
        const v = fold([
            { type: "claim-resolved", claim: "c", anchors: ["W1"] },
            { type: "origins", ids: ["W1"] },
            { type: "cycles", cycles: [["W1", "W2"]] },
            { type: "drift-finding", finding },
        ]);
        expect(v.partial.claim).toBe("c");
        expect(v.partial.anchors).toEqual(["W1"]);
        expect(v.partial.originCandidates).toEqual(["W1"]);
        expect(v.partial.cycles).toEqual([["W1", "W2"]]);
        expect(v.partial.driftFindings).toEqual([finding]);
    });

    it("a re-audited origin replaces its previous drift finding", () => {
        const first = {
            workId: "W1",
            label: "drifted" as const,
            evidenceQuote: null,
            explanation: "e1",
            basis: "abstract" as const,
        };
        const second = { ...first, explanation: "e2" };
        const v = fold([
            { type: "drift-finding", finding: first },
            { type: "drift-finding", finding: second },
        ]);
        expect(v.partial.driftFindings).toEqual([second]);
    });
});

describe("liveRunState", () => {
    const input: RunInput = { kind: "claim", text: "spinach is rich in iron" };

    it("is null before any node arrives", () => {
        expect(liveRunState(initialLiveView(), input)).toBeNull();
    });

    it("mirrors the partial once nodes exist", () => {
        const v = fold([
            { type: "claim-resolved", claim: "c", anchors: ["W1"] },
            { type: "graph-delta", nodes: [node("W1")], edges: [] },
        ]);
        const s = liveRunState(v, input);
        expect(s?.claim).toBe("c");
        expect(s?.graph.nodes.map((n) => n.id)).toEqual(["W1"]);
        expect(s?.verdict).toBeNull();
        expect(s?.errors).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/run/client/__tests__/stream.test.ts`
Expected: FAIL — `partial` / `liveRunState` don't exist.

- [ ] **Step 3: Implement in `src/core/run/client/stream.ts`**

Extend imports:

```ts
import type {
    AgentName,
    CitationEdge,
    CitationNode,
    DriftFinding,
    RunInput,
    RunSseEvent,
    RunState,
    TraceEvent,
    Verdict,
    WorkId,
} from "@/core/run/domain";
```

Add the partial to the view:

```ts
/** Graph-so-far assembled from ephemeral delta events during a live run. */
export interface LivePartial {
    claim: string;
    anchors: WorkId[];
    graph: {
        nodes: CitationNode[];
        edges: CitationEdge[];
        truncated: boolean;
    };
    cycles: WorkId[][];
    originCandidates: WorkId[];
    driftFindings: DriftFinding[];
}

export interface LiveView {
    runId?: string;
    agents: Record<AgentName, AgentStatus>;
    trace: TraceEvent[];
    partial: LivePartial;
    terminal?: "done" | "failed";
    verdict?: Verdict;
    failureMessage?: string;
}

export function initialLiveView(): LiveView {
    return {
        agents: {
            "input-adapter": "idle",
            "chain-tracer": "idle",
            "primacy-judge": "idle",
            "drift-auditor": "idle",
            verdict: "idle",
        },
        trace: [],
        partial: {
            claim: "",
            anchors: [],
            graph: { nodes: [], edges: [], truncated: false },
            cycles: [],
            originCandidates: [],
            driftFindings: [],
        },
    };
}
```

Add the new cases to `streamReducer` (existing cases unchanged):

```ts
case "claim-resolved":
    return {
        ...view,
        partial: {
            ...view.partial,
            claim: event.claim,
            anchors: event.anchors,
        },
    };
case "graph-delta": {
    const have = new Set(view.partial.graph.nodes.map((n) => n.id));
    const nodes = [
        ...view.partial.graph.nodes,
        ...event.nodes.filter((n) => !have.has(n.id)),
    ];
    const haveEdges = new Set(
        view.partial.graph.edges.map((e) => `${e.from}|${e.to}`),
    );
    const edges = [...view.partial.graph.edges];
    for (const e of event.edges) {
        const key = `${e.from}|${e.to}`;
        if (haveEdges.has(key)) continue;
        haveEdges.add(key);
        edges.push(e);
    }
    return {
        ...view,
        partial: {
            ...view.partial,
            graph: { ...view.partial.graph, nodes, edges },
        },
    };
}
case "nodes-patch": {
    const byId = new Map(event.patches.map((p) => [p.id, p.primacy]));
    const nodes = view.partial.graph.nodes.map((n) => {
        const primacy = byId.get(n.id);
        return primacy ? { ...n, primacy } : n;
    });
    return {
        ...view,
        partial: {
            ...view.partial,
            graph: { ...view.partial.graph, nodes },
        },
    };
}
case "origins":
    return {
        ...view,
        partial: { ...view.partial, originCandidates: event.ids },
    };
case "cycles":
    return { ...view, partial: { ...view.partial, cycles: event.cycles } };
case "drift-finding": {
    const driftFindings = [
        ...view.partial.driftFindings.filter(
            (f) => f.workId !== event.finding.workId,
        ),
        event.finding,
    ];
    return { ...view, partial: { ...view.partial, driftFindings } };
}
```

Add at the bottom:

```ts
/**
 * A RunState assembled from the live partial, so the dashboard can reuse
 * deriveGraphView mid-run. Null until the first node lands (the canvas shows
 * a "resolving" placeholder until then). The final GET replaces this with
 * the persisted state — same shape, richer content, no visual jump.
 */
export function liveRunState(
    view: LiveView,
    input: RunInput,
): RunState | null {
    const p = view.partial;
    if (p.graph.nodes.length === 0) return null;
    return {
        input,
        claim: p.claim,
        anchors: p.anchors,
        graph: p.graph,
        cycles: p.cycles,
        originCandidates: p.originCandidates,
        driftFindings: p.driftFindings,
        verdict: view.verdict ?? null,
        trace: view.trace,
        errors: [],
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/core/run/client`
Expected: PASS (old reducer tests + new ones).

- [ ] **Step 5: Commit**

```bash
git add src/core/run/client
git commit -m "feat: client reducer folds deltas into a live partial RunState"
```

---

### Task 10: CitationGraph syncs incrementally (renderer created once)

**Files:**
- Create: `src/app/(app)/audit/_lib/graph-sync.ts`
- Modify: `src/app/(app)/audit/_components/CitationGraph.tsx`
- Test: `src/app/(app)/audit/_lib/__tests__/graph-sync.test.ts`

**Interfaces:**
- Consumes: `GraphView`/`NodeView`/`EdgeView` from `@/core/run/client/graph-view`; `radialLayout` from `../_lib/radial-layout` (existing).
- Produces:
  - `syncGraph(g: Graph, view: GraphView): void` — makes the graphology instance mirror the view (merge attrs, add new, drop gone). Node attrs keep the exact keys the current component writes (`x`, `y`, `size`, `type: "bordered"`, `color`, `borderColor`, `fillColor`, `label`, `title`, `depth`); edge attrs keep `size`, `color`, `kind`.
  - `CitationGraph` gains prop `cascade?: boolean` (default `false`). `cascade` = depth-by-depth reveal (replay behavior); otherwise nodes show as soon as they're synced. Renderer + graphology instance are created once per mount; `view` changes only sync + refresh (camera preserved).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/(app)/audit/_lib/__tests__/graph-sync.test.ts
import Graph from "graphology";
import { describe, expect, it } from "vitest";
import type {
    GraphView,
    NodeView,
} from "@/core/run/client/graph-view";
import type { CitationNode } from "@/core/run/domain";
import { syncGraph } from "../graph-sync";

const node = (id: string, depth = 0): CitationNode => ({
    id,
    title: `Paper ${id}`,
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: null,
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth,
    source: "openalex",
    fetchStatus: "resolved",
});

const nv = (
    id: string,
    depth = 0,
    severity: NodeView["severity"] = "neutral",
): NodeView => ({
    node: node(id, depth),
    shape: "dashed",
    severity,
    isOrigin: false,
    inCycle: false,
    pathogens: [],
});

const viewOf = (
    nodes: NodeView[],
    edges: Array<[string, string]>,
): GraphView => ({
    nodes,
    edges: edges.map(([from, to]) => ({
        id: `${from}->${to}`,
        edge: { from, to },
        kind: "citation" as const,
    })),
    truncated: false,
});

describe("syncGraph", () => {
    it("adds nodes and edges incrementally without dropping existing ones", () => {
        const g = new Graph({ multi: false, type: "directed" });
        syncGraph(g, viewOf([nv("W1")], []));
        expect(g.order).toBe(1);

        syncGraph(g, viewOf([nv("W1"), nv("W2", 1)], [["W1", "W2"]]));
        expect(g.order).toBe(2);
        expect(g.size).toBe(1);
        expect(g.hasEdge("W1->W2")).toBe(true);
    });

    it("updates attributes of existing nodes (recolor on severity change)", () => {
        const g = new Graph({ multi: false, type: "directed" });
        syncGraph(g, viewOf([nv("W1")], []));
        const before = g.getNodeAttribute("W1", "color");
        syncGraph(g, viewOf([nv("W1", 0, "flagged")], []));
        const after = g.getNodeAttribute("W1", "color");
        expect(after).not.toBe(before);
        expect(g.order).toBe(1);
    });

    it("drops nodes and edges absent from the view", () => {
        const g = new Graph({ multi: false, type: "directed" });
        syncGraph(g, viewOf([nv("W1"), nv("W2", 1)], [["W1", "W2"]]));
        syncGraph(g, viewOf([nv("W1")], []));
        expect(g.order).toBe(1);
        expect(g.size).toBe(0);
    });

    it("gives every node a position", () => {
        const g = new Graph({ multi: false, type: "directed" });
        syncGraph(g, viewOf([nv("W1"), nv("W2", 1)], [["W1", "W2"]]));
        for (const id of g.nodes()) {
            expect(typeof g.getNodeAttribute(id, "x")).toBe("number");
            expect(typeof g.getNodeAttribute(id, "y")).toBe("number");
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run "src/app/(app)/audit/_lib/__tests__/graph-sync.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `graph-sync.ts`** — move the attribute-computation logic out of the component verbatim:

```ts
import type Graph from "graphology";
import type {
    EdgeView,
    GraphView,
    NodeSeverity,
} from "@/core/run/client/graph-view";
import { radialLayout } from "./radial-layout";

/**
 * Visual constants for the Sigma canvas. Moved here from CitationGraph so
 * the graph-instance sync is a pure, headless-testable function.
 */
export const SEVERITY_COLOR: Record<NodeSeverity, string> = {
    flagged: "#CF222E",
    caution: "#9A6700",
    healthy: "#1A7F37",
    neutral: "#8C959F",
};

const EDGE_PLAIN = "#D0D7DE";
const EDGE_SUPPORT = "#57606A";
const EDGE_CYCLE = "#CF222E";

/** Full paper titles run long enough to cover the canvas. */
const LABEL_MAX = 46;
const truncate = (title: string) =>
    title.length > LABEL_MAX ? `${title.slice(0, LABEL_MAX - 1)}…` : title;

const MIN_SIZE = 3;
const MAX_SIZE = 16;

const edgeAttrs = (ev: EdgeView) => ({
    size: ev.kind === "cycle" ? 2.5 : ev.kind === "support-path" ? 1.6 : 0.6,
    color:
        ev.kind === "cycle"
            ? EDGE_CYCLE
            : ev.kind === "support-path"
              ? EDGE_SUPPORT
              : EDGE_PLAIN,
    kind: ev.kind,
});

/**
 * Make the graphology instance mirror the view: merge attributes into
 * existing nodes/edges, add new ones, drop the gone. Positions come from
 * radialLayout on the full view each call — the layout is deterministic by
 * depth, so existing nodes only shift within their ring as siblings arrive.
 */
export function syncGraph(g: Graph, view: GraphView): void {
    const placed = radialLayout(view);

    // In-degree stands in for how load-bearing a paper is.
    const inDegree = new Map<string, number>();
    for (const ev of view.edges) {
        inDegree.set(ev.edge.to, (inDegree.get(ev.edge.to) ?? 0) + 1);
    }
    const maxIn = Math.max(1, ...inDegree.values());

    const keepNodes = new Set<string>();
    for (const nv of view.nodes) {
        keepNodes.add(nv.node.id);
        const at = placed.get(nv.node.id);
        const cited = inDegree.get(nv.node.id) ?? 0;
        const colour = SEVERITY_COLOR[nv.severity];
        const solid = nv.shape === "solid";
        // sqrt so a hub with 10x the citations reads as ~3x the dot.
        const size =
            MIN_SIZE +
            Math.sqrt(cited / maxIn) * (MAX_SIZE - MIN_SIZE) +
            (nv.isOrigin ? 4 : 0);

        g.mergeNode(nv.node.id, {
            x: at?.x ?? 0,
            y: at?.y ?? 0,
            size,
            type: "bordered",
            color: colour,
            borderColor: colour,
            // Hollow centre unless the node holds original data.
            fillColor: solid ? colour : "#FFFFFF",
            // Naming all 200 is noise; name the ones the reader needs.
            label:
                nv.isOrigin ||
                nv.inCycle ||
                nv.severity === "flagged" ||
                nv.node.depth === 0 ||
                cited >= Math.max(3, maxIn * 0.4)
                    ? truncate(nv.node.title)
                    : "",
            title: nv.node.title,
            depth: nv.node.depth,
        });
    }
    for (const id of g.nodes()) {
        if (!keepNodes.has(id)) g.dropNode(id);
    }

    const keepEdges = new Set<string>();
    for (const ev of view.edges) {
        if (!g.hasNode(ev.edge.from) || !g.hasNode(ev.edge.to)) continue;
        keepEdges.add(ev.id);
        if (g.hasEdge(ev.id)) {
            g.mergeEdgeAttributes(ev.id, edgeAttrs(ev));
        } else {
            g.addEdgeWithKey(ev.id, ev.edge.from, ev.edge.to, edgeAttrs(ev));
        }
    }
    for (const id of g.edges()) {
        if (!keepEdges.has(id)) g.dropEdge(id);
    }
}
```

(Note: `g.nodes()`/`g.edges()` return fresh arrays, so dropping inside the loop is safe.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run "src/app/(app)/audit/_lib/__tests__/graph-sync.test.ts"`
Expected: PASS.

- [ ] **Step 5: Rewrite `CitationGraph.tsx` around the long-lived renderer**

Replace the component's graph-building `useMemo` + per-graph `useEffect` with a mount-once effect and a sync effect. Full new component body (imports: drop the constants that moved, add `syncGraph`, `SEVERITY_COLOR` no longer needed here):

```tsx
"use client";

import { createNodeBorderProgram } from "@sigma/node-border";
import Graph from "graphology";
import { useEffect, useRef } from "react";
import Sigma from "sigma";
import type { GraphView } from "@/core/run/client/graph-view";
import { syncGraph } from "../_lib/graph-sync";

/**
 * WebGL citation graph (Sigma v3 over graphology).
 *
 * The renderer and its graphology instance live for the whole mount; view
 * changes are synced into the existing instance (graph-sync.ts) so a live
 * run can stream nodes in without killing the camera or the WebGL context.
 */

const CANVAS_INK = "#1F2328";
const EDGE_PLAIN = "#D0D7DE";
const DIMMED = "#EAEEF2";

/** Solid disc for primary sources, hollow ring for secondary/unresolved. */
const NodeProgram = createNodeBorderProgram({
    borders: [
        { color: { attribute: "borderColor" }, size: { value: 0.35 } },
        { color: { attribute: "fillColor" }, size: { fill: true } },
    ],
});

const CASCADE_FIRST_MS = 220;
const CASCADE_STEP_MS = 420;

export function CitationGraph({
    view,
    onNodeClick,
    selectedId = null,
    insetRight = 0,
    cascade = false,
}: {
    view: GraphView;
    onNodeClick?: (id: string | null) => void;
    /** Node the inspector is open on; drawn with a halo. */
    selectedId?: string | null;
    /** Pixels of the pane covered by an overlay, so the graph keeps clear
     * of it: Sigma refits when its container resizes. */
    insetRight?: number;
    /** Replay mode: reveal the chain one citation ring at a time. Live mode
     * leaves this false — nodes appear the moment they stream in. */
    cascade?: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<Sigma | null>(null);
    const graphRef = useRef<Graph | null>(null);
    const clickRef = useRef(onNodeClick);
    clickRef.current = onNodeClick;
    // Read inside the reducers, which are created once with the renderer.
    const selectedRef = useRef(selectedId);
    selectedRef.current = selectedId;
    /** Depth ≤ this is visible; Infinity = everything (live mode). */
    const revealRef = useRef(Number.POSITIVE_INFINITY);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const g = new Graph({ multi: false, type: "directed" });
        graphRef.current = g;

        let hovered: string | null = null;
        let neighbours = new Set<string>();

        const renderer = new Sigma(g, container, {
            nodeProgramClasses: { bordered: NodeProgram },
            defaultEdgeColor: EDGE_PLAIN,
            labelColor: { color: CANVAS_INK },
            labelFont: "var(--font-body), system-ui, sans-serif",
            labelSize: 11,
            labelDensity: 0.35,
            // Sigma hides labels for nodes below this on-screen size, which
            // keeps a dense ring legible while hubs stay named.
            labelRenderedSizeThreshold: 5,
            zIndex: true,
            minCameraRatio: 0.05,
            maxCameraRatio: 4,
            // Hovering a paper fades everything it isn't connected to — the
            // only practical way to read one citation path out of hundreds.
            nodeReducer: (node, data) => {
                if (((data.depth as number) ?? 0) > revealRef.current) {
                    return { ...data, hidden: true };
                }
                const selected = node === selectedRef.current;
                if (selected) {
                    return {
                        ...data,
                        size: data.size * 1.6,
                        label: (data.title as string) ?? data.label,
                        borderColor: CANVAS_INK,
                        zIndex: 2,
                    };
                }
                if (!hovered) return data;
                if (node === hovered || neighbours.has(node)) {
                    return { ...data, zIndex: 1 };
                }
                return {
                    ...data,
                    label: "",
                    color: DIMMED,
                    borderColor: DIMMED,
                    fillColor: DIMMED,
                    zIndex: 0,
                };
            },
            edgeReducer: (edge, data) => {
                const [from, to] = g.extremities(edge);
                const deepest = Math.max(
                    (g.getNodeAttribute(from, "depth") as number) ?? 0,
                    (g.getNodeAttribute(to, "depth") as number) ?? 0,
                );
                if (deepest > revealRef.current) {
                    return { ...data, hidden: true };
                }
                if (!hovered) return data;
                const touches = from === hovered || to === hovered;
                return touches
                    ? { ...data, size: Math.max(data.size, 1.4), zIndex: 1 }
                    : { ...data, color: DIMMED, zIndex: 0 };
            },
        });

        renderer.on("enterNode", ({ node }) => {
            hovered = node;
            neighbours = new Set(g.neighbors(node));
            renderer.refresh({ skipIndexation: true });
        });
        renderer.on("leaveNode", () => {
            hovered = null;
            neighbours = new Set();
            renderer.refresh({ skipIndexation: true });
        });
        renderer.on("clickNode", ({ node }) => clickRef.current?.(node));
        // Clicking empty canvas dismisses the inspector.
        renderer.on("clickStage", () => clickRef.current?.(null));
        rendererRef.current = renderer;

        return () => {
            rendererRef.current = null;
            graphRef.current = null;
            renderer.kill();
        };
    }, []);

    useEffect(() => {
        const g = graphRef.current;
        const renderer = rendererRef.current;
        if (!g || !renderer) return;

        syncGraph(g, view);

        const reduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        const maxDepth = view.nodes.reduce(
            (deepest, nv) => Math.max(deepest, nv.node.depth),
            0,
        );

        if (!cascade || reduced || maxDepth === 0) {
            revealRef.current = Number.POSITIVE_INFINITY;
            renderer.refresh();
            return;
        }

        // Replay: reveal the chain one citation ring at a time, so a viewer
        // can see the trace walk backwards instead of a graph appearing at
        // once.
        revealRef.current = 0;
        renderer.refresh();
        let timer: number | undefined;
        const step = () => {
            revealRef.current += 1;
            renderer.refresh({ skipIndexation: true });
            if (revealRef.current < maxDepth) {
                timer = window.setTimeout(step, CASCADE_STEP_MS);
            }
        };
        timer = window.setTimeout(step, CASCADE_FIRST_MS);
        return () => {
            if (timer) window.clearTimeout(timer);
        };
    }, [view, cascade]);

    const zoom = (factor: number) =>
        rendererRef.current
            ?.getCamera()
            .animate(
                { ratio: rendererRef.current.getCamera().ratio * factor },
                { duration: 220 },
            );

    /* ...JSX return unchanged from the current file (container div + zoom
       buttons)... */
}
```

Keep the existing JSX return block exactly as it is today.

- [ ] **Step 6: Typecheck + full frontend-adjacent tests**

Run: `pnpm typecheck && pnpm exec vitest run "src/app" src/core/run/client`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/audit/_lib" "src/app/(app)/audit/_components/CitationGraph.tsx"
git commit -m "feat: CitationGraph syncs incrementally, renderer lives across updates"
```

---

### Task 11: OrchestraRail + TraceFeed + rail styles

**Files:**
- Create: `src/app/(app)/audit/_components/OrchestraRail.tsx`
- Create: `src/app/(app)/audit/_components/TraceFeed.tsx`
- Modify: `src/app/(app)/audit/_components/VerdictCard.tsx`
- Modify: `src/app/(app)/audit/audit.css`

**Interfaces:**
- Consumes: `AGENT_ORDER`, `AgentStatus` from `@/core/run/client/stream`; `AgentName`, `TraceEvent`, `Verdict` from `@/core/run/domain`; `VerdictCard`.
- Produces:
  - `OrchestraRail({ agents, trace, verdict, counts, failureMessage })` with `counts: { nodes: number; edges: number; origins: number; drifts: number }`, `failureMessage?: string`.
  - `TraceFeed({ trace: TraceEvent[] })`.
  - `VerdictCard` accepts optional `embedded?: boolean` (renders borderless inside a rail card; returns `null` when embedded and verdict is null).
  - CSS classes: `.rail-card`, `.rail-idle/.rail-running/.rail-done/.rail-recovered/.rail-error`, `.rail-glyph`, `.rail-connector`, `.rail-handing`.

No unit test — these are presentational; behavior is exercised through Task 12's dashboard wiring and Task 13's manual check. (There is no component-test infrastructure in this repo; do not introduce one.)

- [ ] **Step 1: Create `TraceFeed.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { AgentName, TraceEvent } from "@/core/run/domain";

const SHORT: Record<AgentName, string> = {
    "input-adapter": "input",
    "chain-tracer": "tracer",
    "primacy-judge": "primacy",
    "drift-auditor": "drift",
    verdict: "verdict",
};

const PHASE_CLASS: Record<TraceEvent["phase"], string> = {
    start: "text-[var(--au-neutral)]",
    progress: "text-[var(--au-neutral)]",
    handoff: "text-[var(--au-accent)]",
    recovery: "text-[var(--au-caution)]",
    error: "text-[var(--au-flag)]",
    done: "text-[var(--au-healthy)]",
};

/** Chronological run log. Follows the newest event like a terminal tail. */
export function TraceFeed({ trace }: { trace: TraceEvent[] }) {
    const ref = useRef<HTMLDivElement>(null);

    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll only when entries are appended, not when the array identity churns.
    useEffect(() => {
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [trace.length]);

    return (
        <div
            ref={ref}
            className="min-h-0 flex-1 overflow-auto border-[var(--au-rule)] border-t p-2 font-[family-name:var(--font-mono)] text-[11px] leading-5"
        >
            {trace.length === 0 && (
                <p className="text-[var(--au-neutral)]">No events yet.</p>
            )}
            {trace.map((e, idx) => (
                <p key={idx} className={PHASE_CLASS[e.phase]}>
                    <span className="text-[var(--au-neutral)]">
                        [{SHORT[e.agent]}]
                    </span>{" "}
                    {e.summary}
                </p>
            ))}
        </div>
    );
}
```

- [ ] **Step 2: Add the `embedded` variant to `VerdictCard.tsx`**

```tsx
export function VerdictCard({
    verdict,
    embedded = false,
}: {
    verdict: Verdict | null;
    /** Inside a rail card: no outer border/padding, hidden while null. */
    embedded?: boolean;
}) {
    if (!verdict) {
        if (embedded) return null;
        return (
            <div className="border-[var(--au-rule)] border-b p-4 text-[var(--au-muted)] text-sm">
                Awaiting verdict…
            </div>
        );
    }

    return (
        <div
            className={
                embedded
                    ? "mt-2 border-[var(--au-rule)] border-t pt-2"
                    : "border-[var(--au-rule)] border-b p-4"
            }
        >
            {/* ...inner content unchanged from the current file... */}
        </div>
    );
}
```

Only the wrapper `div` className changes; the confidence dot, pathogen chips,
coverage line and prose stay exactly as they are.

- [ ] **Step 3: Create `OrchestraRail.tsx`**

```tsx
"use client";

import { AGENT_ORDER, type AgentStatus } from "@/core/run/client/stream";
import type { AgentName, TraceEvent, Verdict } from "@/core/run/domain";
import { TraceFeed } from "./TraceFeed";
import { VerdictCard } from "./VerdictCard";

const META: Record<AgentName, { label: string; role: string }> = {
    "input-adapter": { label: "Input", role: "claim → anchors" },
    "chain-tracer": { label: "ChainTracer", role: "BFS over references" },
    "primacy-judge": { label: "PrimacyJudge", role: "primary vs secondary" },
    "drift-auditor": { label: "DriftAuditor", role: "origin vs claim" },
    verdict: { label: "Verdict", role: "score + pathogens" },
};

const STATUS_GLYPH: Record<AgentStatus, string> = {
    idle: "·",
    running: "▶",
    done: "✓",
    recovered: "⚠",
    error: "✕",
};

function lastSummary(trace: TraceEvent[], agent: AgentName): string | null {
    for (let i = trace.length - 1; i >= 0; i--) {
        if (trace[i].agent === agent) return trace[i].summary;
    }
    return null;
}

export interface RailCounts {
    nodes: number;
    edges: number;
    origins: number;
    drifts: number;
}

/**
 * The orchestration scene: the five agents as a vertical pipeline with live
 * status, per-agent stats, animated handoffs, and the verdict landing in the
 * final card. The trace feed tails the run underneath.
 */
export function OrchestraRail({
    agents,
    trace,
    verdict,
    counts,
    failureMessage,
}: {
    agents: Record<AgentName, AgentStatus>;
    trace: TraceEvent[];
    verdict: Verdict | null;
    counts: RailCounts;
    failureMessage?: string;
}) {
    const statLine = (agent: AgentName): string | null => {
        switch (agent) {
            case "chain-tracer":
                return counts.nodes > 0
                    ? `${counts.nodes} nodes · ${counts.edges} edges`
                    : lastSummary(trace, agent);
            case "primacy-judge":
                return counts.origins > 0
                    ? `${counts.origins} origin candidate(s)`
                    : lastSummary(trace, agent);
            case "drift-auditor":
                return counts.drifts > 0
                    ? `${counts.drifts} drift finding(s)`
                    : lastSummary(trace, agent);
            default:
                return lastSummary(trace, agent);
        }
    };

    const anyErrored = AGENT_ORDER.some((a) => agents[a] === "error");

    return (
        <aside className="flex min-h-0 flex-col overflow-hidden bg-[var(--au-paper-2)]">
            <div className="flex-none overflow-auto p-3">
                {AGENT_ORDER.map((agent, i) => {
                    const status = agents[agent];
                    const next = AGENT_ORDER[i + 1];
                    const handing =
                        next !== undefined &&
                        status === "done" &&
                        agents[next] === "running";
                    return (
                        <div key={agent}>
                            <div className={`rail-card rail-${status}`}>
                                <div className="flex items-center gap-2">
                                    <span className="rail-glyph font-[family-name:var(--font-mono)]">
                                        {STATUS_GLYPH[status]}
                                    </span>
                                    <span className="font-[family-name:var(--font-display)] font-semibold text-[var(--au-ink)] text-sm">
                                        {META[agent].label}
                                    </span>
                                    {status !== "idle" && (
                                        <span className="ml-auto text-[10px] text-[var(--au-neutral)] uppercase tracking-wide">
                                            {status}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 truncate font-[family-name:var(--font-mono)] text-[11px] text-[var(--au-muted)]">
                                    {status === "idle"
                                        ? META[agent].role
                                        : (statLine(agent) ??
                                          META[agent].role)}
                                </p>
                                {status === "error" && failureMessage && (
                                    <p
                                        role="alert"
                                        className="mt-1 text-[11px] text-[var(--au-flag)]"
                                    >
                                        {failureMessage}
                                    </p>
                                )}
                                {agent === "verdict" && (
                                    <VerdictCard
                                        verdict={verdict}
                                        embedded
                                    />
                                )}
                            </div>
                            {next !== undefined && (
                                <div
                                    className={`rail-connector${handing ? " rail-handing" : ""}`}
                                    aria-hidden="true"
                                />
                            )}
                        </div>
                    );
                })}
                {failureMessage && !anyErrored && (
                    <p
                        role="alert"
                        className="mt-2 text-[11px] text-[var(--au-flag)]"
                    >
                        {failureMessage}
                    </p>
                )}
            </div>
            <TraceFeed trace={trace} />
        </aside>
    );
}
```

- [ ] **Step 4: Append rail styles to `audit.css`**

```css
/* ── Orchestration rail ────────────────────────────────────────────── */
.audit-scope .rail-card {
    border: 1px solid var(--au-rule);
    border-radius: 6px;
    padding: 8px 10px;
    background: var(--au-paper);
    position: relative;
    transition:
        border-color 200ms ease,
        box-shadow 200ms ease,
        opacity 200ms ease;
}
.audit-scope .rail-idle {
    opacity: 0.55;
}
.audit-scope .rail-running {
    border-color: var(--au-accent);
    box-shadow: 0 0 12px oklch(72% 0.15 60 / 0.18);
}
/* Beam: the active agent reaches toward the canvas it is working on. */
.audit-scope .rail-running::after {
    content: "";
    position: absolute;
    top: 50%;
    right: -13px;
    width: 13px;
    height: 1px;
    background: linear-gradient(to right, var(--au-accent), transparent);
    animation: au-beam 1.4s ease-in-out infinite;
}
.audit-scope .rail-error {
    border-color: var(--au-flag);
}
.audit-scope .rail-running .rail-glyph {
    color: var(--au-accent);
}
.audit-scope .rail-done .rail-glyph {
    color: var(--au-healthy);
}
.audit-scope .rail-recovered .rail-glyph {
    color: var(--au-caution);
}
.audit-scope .rail-error .rail-glyph {
    color: var(--au-flag);
}

.audit-scope .rail-connector {
    width: 1px;
    height: 14px;
    margin-left: 21px;
    background: var(--au-rule);
    position: relative;
}
/* Handoff: a packet of work travels from the finished agent to the next. */
.audit-scope .rail-handing::before {
    content: "";
    position: absolute;
    left: -2.5px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--au-focus);
    box-shadow: 0 0 8px var(--au-focus);
    animation: au-packet 1.1s ease-in-out infinite;
}

@keyframes au-packet {
    0% {
        top: -3px;
        opacity: 1;
    }
    70% {
        top: 11px;
        opacity: 1;
    }
    100% {
        top: 11px;
        opacity: 0;
    }
}
@keyframes au-beam {
    50% {
        opacity: 0.25;
    }
}
@media (prefers-reduced-motion: reduce) {
    .audit-scope .rail-handing::before,
    .audit-scope .rail-running::after {
        animation: none;
    }
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS (fix any biome formatting it reports with `pnpm exec biome check --write .` restricted to the touched files).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/audit"
git commit -m "feat: orchestration rail with agent cards, handoffs and trace feed"
```

---

### Task 12: RunDashboard hybrid layout + live wiring; remove PipelineBar/AuditLog

**Files:**
- Modify: `src/app/(app)/audit/_components/RunDashboard.tsx`
- Modify: `src/app/(app)/audit/_hooks/useRunStream.ts`
- Delete: `src/app/(app)/audit/_components/PipelineBar.tsx`
- Delete: `src/app/(app)/audit/_components/AuditLog.tsx`

**Interfaces:**
- Consumes: `OrchestraRail`/`TraceFeed` (Task 11), `liveRunState` (Task 9), `CitationGraph` with `cascade` (Task 10).
- Produces: `RunDashboard({ state, live, mode })` — same signature as today. `useRunStream()` — same return keys `{ live, state, start, status }`, but `state` is now the live partial state mid-run and the persisted state after.

- [ ] **Step 1: Wire the live state into `useRunStream.ts`**

Add imports `liveRunState` from `@/core/run/client/stream` and `useRef`; inside the hook:

```ts
const inputRef = useRef<RunInput | null>(null);
```

First line of `start`, before `setState(null)`:

```ts
inputRef.current = input;
```

Change the return statement to:

```ts
const displayState =
    state ??
    (live && inputRef.current
        ? liveRunState(live, inputRef.current)
        : null);

return { live, state: displayState, start, status };
```

- [ ] **Step 2: Rewrite `RunDashboard.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
    deriveGraphView,
    worstDriftOrigin,
} from "@/core/run/client/graph-view";
import {
    AGENT_ORDER,
    type AgentStatus,
    initialLiveView,
    type LiveView,
} from "@/core/run/client/stream";
import type { AgentName, RunState } from "@/core/run/domain";
import "../audit.css";
import dynamic from "next/dynamic";

// Sigma renders into a client-measured canvas the server can't reproduce,
// so the graph is client-only.
const CitationGraph = dynamic(
    () => import("./CitationGraph").then((m) => m.CitationGraph),
    { ssr: false },
);

import { Legend } from "./Legend";
import { NodePanel } from "./NodePanel";
import { OrchestraRail } from "./OrchestraRail";

export type DashboardMode = "live" | "replay";

const NODE_CASCADE_STEP_MS = 420;
const NODE_REVEAL_DURATION_MS = 420;

export function RunDashboard({
    state,
    live,
    mode,
}: {
    state: RunState | null;
    live?: LiveView;
    mode: DashboardMode;
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const [revealKey, setRevealKey] = useState(0);

    const displayAgents: Record<AgentName, AgentStatus> =
        live?.agents ??
        (mode === "replay"
            ? (Object.fromEntries(
                  AGENT_ORDER.map((a) => [a, "done" as const]),
              ) as Record<AgentName, AgentStatus>)
            : initialLiveView().agents);

    const view = useMemo(
        () => (state ? deriveGraphView(state) : null),
        [state],
    );

    // Live runs grow in place; replay (and the Replay button) cascade.
    const cascade = mode === "replay" || revealKey > 0;
    const finished = mode === "replay" || live?.terminal === "done";
    const running = mode === "live" && live !== undefined && !live.terminal;

    // A cleared run (new run starting) closes the inspector.
    useEffect(() => {
        if (!state) setSelected(null);
    }, [state]);

    // Auto-open the worst drifted origin — but only once the run is over.
    // Mid-run the state changes on every delta; touching the selection then
    // would fight the user's own clicks.
    // biome-ignore lint/correctness/useExhaustiveDependencies: revealKey deliberately restarts this sequence on Replay.
    useEffect(() => {
        if (!state || !finished) return;

        const origin = worstDriftOrigin(state);
        if (!origin) return;

        const maxDepth = state.graph.nodes.reduce(
            (deepest, node) => Math.max(deepest, node.depth),
            0,
        );
        const delay = cascade
            ? maxDepth * NODE_CASCADE_STEP_MS + NODE_REVEAL_DURATION_MS
            : NODE_REVEAL_DURATION_MS;
        const timer = window.setTimeout(() => setSelected(origin), delay);

        return () => window.clearTimeout(timer);
    }, [revealKey, state, finished, cascade]);

    return (
        <div className="audit-scope grid h-[calc(100svh-3.5rem)] grid-cols-[320px_1fr] bg-[var(--au-paper)] font-[family-name:var(--font-body)] text-[var(--au-ink)]">
            <OrchestraRail
                agents={displayAgents}
                trace={live?.trace ?? state?.trace ?? []}
                verdict={state?.verdict ?? live?.verdict ?? null}
                counts={{
                    nodes: state?.graph.nodes.length ?? 0,
                    edges: state?.graph.edges.length ?? 0,
                    origins: state?.originCandidates.length ?? 0,
                    drifts: state?.driftFindings.length ?? 0,
                }}
                failureMessage={
                    live?.terminal === "failed"
                        ? (live.failureMessage ?? "Run failed.")
                        : undefined
                }
            />
            <section className="relative border-[var(--au-rule)] border-l bg-[var(--au-canvas)]">
                {view ? (
                    <>
                        <CitationGraph
                            key={revealKey}
                            view={view}
                            cascade={cascade}
                            onNodeClick={setSelected}
                            selectedId={selected}
                            insetRight={state && selected ? 360 : 0}
                        />
                        <button
                            type="button"
                            onClick={() => setRevealKey((key) => key + 1)}
                            className="absolute top-3 left-3 z-10 rounded border border-[var(--au-canvas-rule)] bg-[var(--au-canvas)]/90 px-2 py-1 text-[var(--au-canvas-ink)] text-xs shadow-sm hover:bg-[var(--au-canvas)]"
                        >
                            Replay
                        </button>
                    </>
                ) : running ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-[var(--au-canvas-ink)]/70">
                        <span className="animate-pulse font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest">
                            resolving anchors…
                        </span>
                        {live?.partial.claim && (
                            <p className="max-w-md text-center text-sm">
                                “{live.partial.claim}”
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center text-[var(--au-canvas-ink)]/60">
                        Enter a claim to begin.
                    </div>
                )}
                {state && selected && (
                    <NodePanel
                        state={state}
                        selectedId={selected}
                        onClose={() => setSelected(null)}
                    />
                )}
                <Legend />
            </section>
        </div>
    );
}
```

Notes:
- The failure banner moves into the rail (`failureMessage` on the errored card / rail bottom) — the old absolute banner over the canvas is gone with this rewrite. The spec was amended to match: one home for failures beats two.
- `VerdictCard` is no longer imported here — the rail renders it.
- With the incremental CitationGraph, mid-run view changes no longer remount (the `key={revealKey}` only changes on the Replay button).

- [ ] **Step 3: Delete the replaced components**

```bash
git rm "src/app/(app)/audit/_components/PipelineBar.tsx" "src/app/(app)/audit/_components/AuditLog.tsx"
```

Then grep for stragglers: `grep -rn "PipelineBar\|AuditLog" src/` must return nothing.

- [ ] **Step 4: Typecheck + lint + full test suite**

Run: `pnpm typecheck && pnpm check && pnpm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A "src/app/(app)/audit"
git commit -m "feat: hybrid run layout — orchestration rail + live graph canvas"
```

---

### Task 13: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `pnpm check && pnpm typecheck && pnpm test`
Expected: all green. Fix anything that isn't before proceeding.

- [ ] **Step 2: Manual live-run check**

Run `pnpm dev`, open `http://localhost:3000/audit` (adjust port if the dev server says otherwise), submit the claim `spinach is a great source of iron` and verify:

1. Canvas immediately shows "resolving anchors…" + the claim — never the empty "Enter a claim" state during a run.
2. Rail: Input card flips running → done; handoff packet animates on the connector; ChainTracer card shows a live climbing node/edge count.
3. Graph nodes appear on the canvas WHILE ChainTracer runs (not all at once at the end); camera does not reset as they arrive.
4. Nodes recolor / gain solid centers as PrimacyJudge patches land; origins get labels.
5. Drift findings appear (flagged origin turns red) while DriftAuditor runs.
6. Verdict card materializes inside the fifth rail card; trace feed auto-scrolls throughout.
7. Click a node mid-run: inspector opens and STAYS open across incoming deltas.
8. After completion, click Replay: depth cascade replays.
9. Open `/runs/sample-run`: replay mode renders — all agents done, cascade reveal works, verdict in the rail.

- [ ] **Step 3: Failure-path check**

Kill the network (or temporarily set an invalid `OPENALEX`/model env) and run once: the errored agent's card turns red with the message, status ends `failed`, UI doesn't hang on "running".

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A && git commit -m "fix: live orchestration polish from e2e verification"
```

(Skip if nothing changed.)
