import type {
    CitationEdge,
    CitationNode,
    DriftFinding,
    Pathogen,
    RunState,
    WorkId,
} from "@/core/run/domain";

export type NodeSeverity = "flagged" | "caution" | "healthy" | "neutral";
export type NodeShape = "solid" | "ring" | "dashed";
export type EdgeKind = "citation" | "cycle" | "support-path";

export interface NodeView {
    node: CitationNode;
    shape: NodeShape;
    severity: NodeSeverity;
    isOrigin: boolean;
    inCycle: boolean;
    drift?: DriftFinding;
    pathogens: Pathogen[];
}

export interface EdgeView {
    id: string;
    edge: CitationEdge;
    kind: EdgeKind;
}

export interface GraphView {
    nodes: NodeView[];
    edges: EdgeView[];
    truncated: boolean;
}

function shapeOf(node: CitationNode): NodeShape {
    if (node.fetchStatus === "unresolved") return "dashed";
    const label = node.primacy?.label ?? "unknown";
    if (label === "primary") return "solid";
    if (label === "secondary") return "ring";
    return "dashed";
}

function severityOf(
    node: CitationNode,
    inCycle: boolean,
    drift: DriftFinding | undefined,
    isOrigin: boolean,
    verdictPathogens: Pathogen[],
): NodeSeverity {
    if (inCycle) return "flagged";
    if (
        drift &&
        (drift.label === "drifted" || drift.label === "contradicted")
    ) {
        return "flagged";
    }
    if (node.isRetracted) return "flagged";
    if (drift && drift.label === "partially-supported") return "caution";
    if (node.fetchStatus === "unresolved") return "caution";
    if (isOrigin && verdictPathogens.includes("no-primary-source"))
        return "caution";
    if (isOrigin && verdictPathogens.includes("single-point-of-failure"))
        return "flagged";
    if (isOrigin && node.primacy?.label === "primary") return "healthy";
    return "neutral";
}

function pathogensOf(
    inCycle: boolean,
    drift: DriftFinding | undefined,
    isOrigin: boolean,
    verdictPathogens: Pathogen[],
): Pathogen[] {
    const out: Pathogen[] = [];
    if (inCycle) out.push("circular-support");
    if (drift && drift.label !== "supported") out.push("claim-drift");
    if (isOrigin && verdictPathogens.includes("single-point-of-failure")) {
        out.push("single-point-of-failure");
    }
    if (isOrigin && verdictPathogens.includes("no-primary-source")) {
        out.push("no-primary-source");
    }
    return out;
}

export function deriveGraphView(state: RunState): GraphView {
    const cycleNodeIds = new Set<WorkId>(state.cycles.flat());
    const cyclePairs = new Set<string>();

    for (const cycle of state.cycles) {
        for (let i = 0; i < cycle.length; i++) {
            const a = cycle[i];
            const b = cycle[(i + 1) % cycle.length];
            cyclePairs.add(`${a}|${b}`);
            cyclePairs.add(`${b}|${a}`);
        }
    }

    const originSet = new Set<WorkId>(state.originCandidates);
    const driftByWork = new Map<WorkId, DriftFinding>(
        state.driftFindings.map((d) => [d.workId, d]),
    );
    const verdictPathogens = state.verdict?.pathogens ?? [];

    const nodes: NodeView[] = state.graph.nodes.map((node) => {
        const inCycle = cycleNodeIds.has(node.id);
        const isOrigin = originSet.has(node.id);
        const drift = driftByWork.get(node.id);

        return {
            node,
            shape: shapeOf(node),
            severity: severityOf(
                node,
                inCycle,
                drift,
                isOrigin,
                verdictPathogens,
            ),
            isOrigin,
            inCycle,
            drift,
            pathogens: pathogensOf(inCycle, drift, isOrigin, verdictPathogens),
        };
    });

    const edges: EdgeView[] = state.graph.edges.map((edge) => {
        let kind: EdgeKind = "citation";
        if (cyclePairs.has(`${edge.from}|${edge.to}`)) {
            kind = "cycle";
        } else if (originSet.has(edge.to)) {
            kind = "support-path";
        }
        return { id: `${edge.from}->${edge.to}`, edge, kind };
    });

    return { nodes, edges, truncated: state.graph.truncated };
}

export function worstDriftOrigin(state: RunState): WorkId | undefined {
    const order = ["contradicted", "drifted", "partially-supported"] as const;
    for (const label of order) {
        const hit = state.driftFindings.find((d) => d.label === label);
        if (hit) return hit.workId;
    }
    return undefined;
}
