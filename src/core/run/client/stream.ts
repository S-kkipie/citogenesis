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

export type AgentStatus = "idle" | "running" | "done" | "recovered" | "error";

export const AGENT_ORDER: AgentName[] = [
    "input-adapter",
    "chain-tracer",
    "primacy-judge",
    "drift-auditor",
    "verdict",
];

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

function statusFromPhase(phase: TraceEvent["phase"]): AgentStatus {
    switch (phase) {
        case "start":
        case "progress":
            return "running";
        case "recovery":
            return "recovered";
        case "error":
            return "error";
        case "handoff":
        case "done":
            return "done";
    }
}

export function streamReducer(view: LiveView, event: RunSseEvent): LiveView {
    switch (event.type) {
        case "accepted":
            return { ...view, runId: event.runId };
        case "trace": {
            const t = event.event;
            const agents = {
                ...view.agents,
                [t.agent]: statusFromPhase(t.phase),
            };
            return { ...view, trace: [...view.trace, t], agents };
        }
        case "done": {
            const agents = { ...view.agents };
            for (const a of AGENT_ORDER) {
                if (agents[a] !== "error") {
                    agents[a] = "done";
                }
            }
            return {
                ...view,
                terminal: "done",
                verdict: event.verdict,
                runId: event.runId,
                agents,
            };
        }
        case "failed":
            return {
                ...view,
                terminal: "failed",
                failureMessage: event.message,
                runId: event.runId,
            };
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
            return {
                ...view,
                partial: { ...view.partial, cycles: event.cycles },
            };
        case "drift-finding": {
            const driftFindings = [
                ...view.partial.driftFindings.filter(
                    (f) => f.workId !== event.finding.workId,
                ),
                event.finding,
            ];
            return { ...view, partial: { ...view.partial, driftFindings } };
        }
    }
}

/**
 * A RunState assembled from the live partial, so the dashboard can reuse
 * deriveGraphView mid-run. Null until the first node lands (the canvas shows
 * a "resolving" placeholder until then). The final GET replaces this with
 * the persisted state — same shape, richer content, no visual jump.
 */
export function liveRunState(view: LiveView, input: RunInput): RunState | null {
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
