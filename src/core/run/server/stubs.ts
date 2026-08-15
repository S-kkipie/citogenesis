/**
 * STUB port implementations. Each is replaced by the real module from its
 * workstream (Part 1: citations, Part 2: agents) — swap the import in
 * graph.ts and delete the stub here.
 */
import type {
    AuditDrift,
    JudgePrimacy,
    ResolveInput,
    TraceChain,
    WriteVerdict,
} from "@/core/run/domain";

export const resolveInputStub: ResolveInput = async (input, emit) => {
    emit({
        agent: "input-adapter",
        phase: "done",
        summary: `STUB: anchored input kind=${input.kind}`,
    });
    return {
        claim: input.kind === "claim" ? input.text : "stub claim",
        anchors: ["W0"],
        errors: [],
    };
};

export const traceChainStub: TraceChain = async (anchors, budget, emit) => {
    emit({
        agent: "chain-tracer",
        phase: "done",
        summary: `STUB: traced ${anchors.length} anchors (budget depth=${budget.maxDepth})`,
    });
    return {
        graph: {
            nodes: [
                {
                    id: "W0",
                    title: "Stub anchor work",
                    year: 2024,
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
                },
            ],
            edges: [],
            truncated: false,
        },
        cycles: [],
        errors: [],
    };
};

export const judgePrimacyStub: JudgePrimacy = async (graph, emit) => {
    emit({
        agent: "primacy-judge",
        phase: "done",
        summary: `STUB: labeled ${graph.nodes.length} nodes`,
    });
    return {
        nodes: graph.nodes.map((n) => ({
            ...n,
            primacy: {
                label: "unknown" as const,
                method: "heuristic" as const,
            },
        })),
        originCandidates: graph.nodes.slice(0, 1).map((n) => n.id),
        errors: [],
    };
};

export const auditDriftStub: AuditDrift = async (_claim, origins, emit) => {
    emit({
        agent: "drift-auditor",
        phase: "done",
        summary: `STUB: audited ${origins.length} origins`,
    });
    return { findings: [], errors: [] };
};

export const writeVerdictStub: WriteVerdict = async (args, emit) => {
    emit({
        agent: "verdict",
        phase: "done",
        summary: "STUB: verdict written",
    });
    const resolved = args.graph.nodes.filter(
        (n) => n.fetchStatus === "resolved",
    ).length;
    return {
        confidence: "LOW",
        score: 0,
        pathogens: [],
        primaryRatio: 0,
        coverage: { resolved, total: args.graph.nodes.length },
        prose: "Stub verdict — agents not wired yet.",
    };
};
