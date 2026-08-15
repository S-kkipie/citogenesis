/**
 * The multi-agent pipeline: a LangGraph state graph over RunState.
 *
 * input-adapter → chain-tracer → primacy-judge → drift-auditor → verdict
 *
 * Node bodies delegate to the port implementations (see domain/ports.ts).
 * This is the single place the implementations are bound.
 */

import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
    END,
    ReducedValue,
    START,
    StateGraph,
    StateSchema,
} from "@langchain/langgraph";
import { z } from "zod";
import type {
    AuditDrift,
    DeltaEmit,
    DeltaEvent,
    JudgePrimacy,
    ResolveInput,
    TraceChain,
    TraceEmit,
    TraceEvent,
    WriteVerdict,
} from "@/core/run/domain";
import {
    citationGraphSchema,
    driftFindingSchema,
    runErrorSchema,
    runInputSchema,
    TRACE_BUDGET,
    traceEventSchema,
    verdictSchema,
    workIdSchema,
} from "@/core/run/domain";

/** The payload shape pushed through LangGraph's custom stream channel. */
export type LiveChunk =
    | { kind: "trace"; event: TraceEvent }
    | { kind: "delta"; event: DeltaEvent };

/**
 * The five agent implementations. Defaults are the live modules; tests
 * inject fakes so the pipeline's wiring can be exercised offline.
 */
export type RunPorts = {
    resolveInput: ResolveInput;
    traceChain: TraceChain;
    judgePrimacy: JudgePrimacy;
    auditDrift: AuditDrift;
    writeVerdict: WriteVerdict;
};

/**
 * The live modules read ServerConfig at import time, which validates the
 * environment. Loading them lazily keeps a fully-injected graph — the
 * wiring tests — runnable with no env at all. Memoized: one load per
 * process, not per run.
 */
let livePortsPromise: Promise<RunPorts> | undefined;
const loadLivePorts = () => {
    livePortsPromise ??= (async () => {
        const [agents, citations] = await Promise.all([
            import("@/core/agents"),
            import("@/core/citations"),
        ]);
        return {
            resolveInput: citations.resolveInput,
            traceChain: citations.traceChain,
            judgePrimacy: agents.judgePrimacy,
            auditDrift: agents.auditDrift,
            writeVerdict: agents.writeVerdict,
        };
    })();
    return livePortsPromise;
};

const appendReducer = <T>(itemSchema: z.ZodType<T>) =>
    new ReducedValue(
        z.array(itemSchema).default(() => []),
        {
            inputSchema: z.array(itemSchema),
            reducer: (current: T[], incoming: T[]) => [...current, ...incoming],
        },
    );

export const RunGraphState = new StateSchema({
    input: runInputSchema,
    claim: z.string().default(""),
    anchors: z.array(workIdSchema).default(() => []),
    graph: citationGraphSchema.default(() => ({
        nodes: [],
        edges: [],
        truncated: false,
    })),
    cycles: z.array(z.array(workIdSchema)).default(() => []),
    originCandidates: z.array(workIdSchema).default(() => []),
    driftFindings: z.array(driftFindingSchema).default(() => []),
    verdict: verdictSchema.nullable().default(null),
    trace: appendReducer(traceEventSchema),
    errors: appendReducer(runErrorSchema),
});

export type RunGraphStateT = typeof RunGraphState.State;

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

export const buildRunGraph = (ports: Partial<RunPorts> = {}) => {
    const port = async <K extends keyof RunPorts>(
        name: K,
    ): Promise<RunPorts[K]> =>
        (ports[name] as RunPorts[K] | undefined) ??
        (await loadLivePorts())[name];

    return new StateGraph(RunGraphState)
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
        .addEdge(START, "input-adapter")
        .addEdge("input-adapter", "chain-tracer")
        .addEdge("chain-tracer", "primacy-judge")
        .addEdge("primacy-judge", "drift-auditor")
        .addEdge("drift-auditor", "verdict-writer")
        .addEdge("verdict-writer", END)
        .compile();
};
