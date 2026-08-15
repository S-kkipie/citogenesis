/**
 * The multi-agent pipeline: a LangGraph state graph over RunState.
 *
 * input-adapter → chain-tracer → primacy-judge → drift-auditor → verdict
 *
 * Node bodies delegate to the port implementations (see domain/ports.ts).
 * This is the single place the implementations are bound.
 */
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
 * Collects trace events emitted during one node execution so the node can
 * return them as a state update (and the router can stream them live).
 */
const collector = (): { emit: TraceEmit; events: TraceEvent[] } => {
    const events: TraceEvent[] = [];
    return {
        events,
        emit: (event) =>
            events.push({ ...event, ts: new Date().toISOString() }),
    };
};

export const buildRunGraph = (ports: Partial<RunPorts> = {}) => {
    const port = async <K extends keyof RunPorts>(
        name: K,
    ): Promise<RunPorts[K]> =>
        (ports[name] as RunPorts[K] | undefined) ??
        (await loadLivePorts())[name];

    return new StateGraph(RunGraphState)
        .addNode("input-adapter", async (state) => {
            const { emit, events } = collector();
            const { claim, anchors, errors } = await (
                await port("resolveInput")
            )(state.input, emit);
            return { claim, anchors, trace: events, errors };
        })
        .addNode("chain-tracer", async (state) => {
            const { emit, events } = collector();
            const { graph, cycles, errors } = await (await port("traceChain"))(
                state.anchors,
                TRACE_BUDGET,
                emit,
            );
            return { graph, cycles, trace: events, errors };
        })
        .addNode("primacy-judge", async (state) => {
            const { emit, events } = collector();
            const { nodes, originCandidates, errors } = await (
                await port("judgePrimacy")
            )(state.graph, emit);
            return {
                graph: { ...state.graph, nodes },
                originCandidates,
                trace: events,
                errors,
            };
        })
        .addNode("drift-auditor", async (state) => {
            const { emit, events } = collector();
            const byId = new Map(state.graph.nodes.map((n) => [n.id, n]));
            const origins = state.originCandidates
                .map((id) => byId.get(id))
                .filter((n) => n !== undefined);
            const { findings, errors } = await (await port("auditDrift"))(
                state.claim,
                origins,
                emit,
            );
            return { driftFindings: findings, trace: events, errors };
        })
        .addNode("verdict-writer", async (state) => {
            const { emit, events } = collector();
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
