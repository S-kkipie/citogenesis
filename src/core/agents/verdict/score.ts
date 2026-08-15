import { selectOrigins } from "@/core/agents/primacy/origin-select";
import type {
    CitationGraph,
    DriftFinding,
    Pathogen,
    WorkId,
} from "@/core/run/domain";

const DRIFT_RANK = {
    supported: 0,
    "partially-supported": 1,
    drifted: 2,
    contradicted: 3,
} as const;
const DRIFT_PENALTY = {
    supported: 0,
    "partially-supported": 20,
    drifted: 40,
    // contradicted always trips the gate above; this weight is never read.
    contradicted: 0,
} as const;

export interface ScoreArgs {
    graph: CitationGraph;
    cycles: WorkId[][];
    driftFindings: DriftFinding[];
}

export interface ScoreResult {
    confidence: "LOW" | "MEDIUM" | "HIGH";
    score: number;
    pathogens: Pathogen[];
    primaryRatio: number;
    coverage: { resolved: number; total: number };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreVerdict({
    graph,
    cycles,
    driftFindings,
}: ScoreArgs): ScoreResult {
    const nodes = graph.nodes;
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const labeled = nodes.filter(
        (n) => n.primacy && n.primacy.label !== "unknown",
    );
    const primary = labeled.filter((n) => n.primacy?.label === "primary");
    const primaryRatio = labeled.length ? primary.length / labeled.length : 0;
    const coverage = {
        resolved: nodes.filter((n) => n.fetchStatus === "resolved").length,
        total: nodes.length,
    };

    const origins = selectOrigins(graph)
        .map((id) => byId.get(id))
        .filter((n) => n != null);
    const noPrimaryOrigin =
        origins.length > 0 &&
        !origins.some((n) => n.primacy?.label === "primary");

    // fan-in per node (edges are from→to)
    const inDeg = new Map<WorkId, number>();
    for (const e of graph.edges) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    const spof =
        origins.length === 1 &&
        (inDeg.get(origins[0].id) ?? 0) >= 3 &&
        (origins[0].isRetracted || origins[0].type === "preprint");

    const worst = driftFindings.reduce(
        (acc, f) => (DRIFT_RANK[f.label] > DRIFT_RANK[acc] ? f.label : acc),
        "supported" as DriftFinding["label"],
    );

    const pathogens: Pathogen[] = [];
    if (cycles.length > 0) pathogens.push("circular-support");
    if (noPrimaryOrigin) pathogens.push("no-primary-source");
    if (spof) pathogens.push("single-point-of-failure");
    if (
        driftFindings.some(
            (f) => f.label === "drifted" || f.label === "contradicted",
        )
    )
        pathogens.push("claim-drift");

    const anyContradicted = driftFindings.some(
        (f) => f.label === "contradicted",
    );
    const anyRetracted = nodes.some((n) => n.isRetracted);
    const gated =
        anyContradicted || anyRetracted || cycles.length > 0 || noPrimaryOrigin;

    if (gated) {
        return {
            confidence: "LOW",
            score: 20,
            pathogens,
            primaryRatio,
            coverage,
        };
    }

    const penalty =
        (1 - primaryRatio) * 45 + DRIFT_PENALTY[worst] + (spof ? 25 : 0);
    const score = clamp(100 - penalty);
    return {
        confidence: score >= 70 ? "HIGH" : "MEDIUM",
        score,
        pathogens,
        primaryRatio,
        coverage,
    };
}
