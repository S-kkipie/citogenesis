/**
 * Ports each workstream implements. The orchestrator's LangGraph nodes call
 * ONLY these signatures — implement to the type and integration is a one-line
 * import swap in src/core/run/server/graph.ts.
 *
 * Part 1 (src/core/citations): ResolveInput, TraceChain.
 * Part 2 (src/core/agents):    JudgePrimacy, AuditDrift, WriteVerdict.
 *
 * Every port receives a TraceEmit — call it on start / progress / recovery /
 * done so the audit log and the SSE stream stay live. Throw only on
 * unrecoverable failures; recoverable ones are reported via RunError.
 */
import type { DeltaEmit } from "./delta";
import type { CitationGraph, CitationNode, TraceBudget, WorkId } from "./graph";
import type { DriftFinding, RunError, RunInput, Verdict } from "./state";
import type { TraceEmit } from "./trace";

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
    /** Same nodes, with `primacy` filled in. */
    nodes: CitationNode[];
    /** ≤3 roots the support chains converge on — DriftAuditor's input. */
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

/** Deterministic score in code + LLM prose. */
export type WriteVerdict = (
    args: {
        claim: string;
        graph: CitationGraph;
        cycles: WorkId[][];
        driftFindings: DriftFinding[];
        errors: RunError[];
    },
    emit: TraceEmit,
) => Promise<Verdict>;
