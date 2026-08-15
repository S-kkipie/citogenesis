/**
 * The multi-agent pipeline: a LangGraph state graph over RunState.
 *
 * input-adapter → chain-tracer → primacy-judge → drift-auditor → verdict
 *
 * Node bodies delegate to the port implementations (see domain/ports.ts).
 * Stubs are swapped for the real modules as workstreams land:
 *   Part 1 → resolveInput/traceChain from "@/core/citations"
 *   Part 2 → judgePrimacy/auditDrift/writeVerdict from "@/core/agents"
 */
import {
    END,
    ReducedValue,
    START,
    StateGraph,
    StateSchema,
} from "@langchain/langgraph";
import { z } from "zod";
import type { TraceEmit, TraceEvent } from "@/core/run/domain";
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
import {
    auditDriftStub,
    judgePrimacyStub,
    resolveInputStub,
    traceChainStub,
    writeVerdictStub,
} from "./stubs";

// Port implementations in use. Swap stubs → real modules here, only here.
const resolveInput = resolveInputStub;
const traceChain = traceChainStub;
const judgePrimacy = judgePrimacyStub;
const auditDrift = auditDriftStub;
const writeVerdict = writeVerdictStub;

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

export const buildRunGraph = () =>
    new StateGraph(RunGraphState)
        .addNode("input-adapter", async (state) => {
            const { emit, events } = collector();
            const { claim, anchors, errors } = await resolveInput(
                state.input,
                emit,
            );
            return { claim, anchors, trace: events, errors };
        })
        .addNode("chain-tracer", async (state) => {
            const { emit, events } = collector();
            const { graph, cycles, errors } = await traceChain(
                state.anchors,
                TRACE_BUDGET,
                emit,
            );
            return { graph, cycles, trace: events, errors };
        })
        .addNode("primacy-judge", async (state) => {
            const { emit, events } = collector();
            const { nodes, originCandidates, errors } = await judgePrimacy(
                state.graph,
                emit,
            );
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
            const { findings, errors } = await auditDrift(
                state.claim,
                origins,
                emit,
            );
            return { driftFindings: findings, trace: events, errors };
        })
        .addNode("verdict-writer", async (state) => {
            const { emit, events } = collector();
            const verdict = await writeVerdict(
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
