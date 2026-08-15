import type { CallResult } from "@/core/agents/gemini/call-structured";
import { callStructured } from "@/core/agents/gemini/call-structured";
import { MODELS } from "@/core/agents/gemini/client";
import { recoveredError } from "@/core/agents/gemini/errors";
import type { CitationNode, JudgePrimacy, RunError } from "@/core/run/domain";
import { heuristicPrimacy } from "./heuristics";
import { selectOrigins } from "./origin-select";
import {
    buildPrimacyPrompt,
    PRIMACY_SYSTEM,
    primacyBatchSchema,
} from "./prompt";

// biome-ignore lint/suspicious/noExplicitAny: injection seam for tests
type CallStructuredFn = (opts: any) => Promise<CallResult<any>>;
const BATCH = 50;

export function makeJudgePrimacy(call: CallStructuredFn): JudgePrimacy {
    return async (graph, emit) => {
        emit({
            agent: "primacy-judge",
            phase: "start",
            summary: `labeling ${graph.nodes.length} nodes`,
        });
        const errors: RunError[] = [];
        const out = new Map<string, CitationNode>();
        const ambiguous: CitationNode[] = [];

        for (const n of graph.nodes) {
            if (n.fetchStatus !== "resolved") {
                out.set(n.id, n);
                continue;
            }
            const h = heuristicPrimacy(n.type);
            if (h) out.set(n.id, { ...n, primacy: h });
            else {
                out.set(n.id, n);
                ambiguous.push(n);
            }
        }
        emit({
            agent: "primacy-judge",
            phase: "progress",
            summary: `${graph.nodes.length - ambiguous.length} heuristic, ${ambiguous.length} to LLM`,
        });

        for (let i = 0; i < ambiguous.length; i += BATCH) {
            const batch = ambiguous.slice(i, i + BATCH);
            try {
                const { data } = await call({
                    model: MODELS.primacy,
                    system: PRIMACY_SYSTEM,
                    contents: buildPrimacyPrompt(batch),
                    schema: primacyBatchSchema,
                    agent: "primacy-judge",
                    emit,
                    label: `primacy batch ${i / BATCH + 1}`,
                });
                const seen = new Set<string>();
                const batchIds = new Set(batch.map((n) => n.id));
                // Count in-batch occurrences per id first, so a duplicated
                // id can be recognized and skipped in the apply pass below
                // (rather than silently taking whichever result came last).
                const counts = new Map<string, number>();
                for (const r of data.results) {
                    if (batchIds.has(r.id))
                        counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
                }
                for (const r of data.results) {
                    if (!batchIds.has(r.id)) {
                        // Hallucinated or cross-batch id: never silently
                        // dropped — every anomaly leaves a trace.
                        errors.push(
                            recoveredError(
                                "primacy-judge",
                                `LLM returned out-of-batch id ${r.id}`,
                            ),
                        );
                        continue;
                    }
                    if ((counts.get(r.id) ?? 0) > 1) continue; // duplicate → left unlabeled, caught below
                    const node = out.get(r.id);
                    if (node) {
                        out.set(r.id, {
                            ...node,
                            primacy: {
                                label: r.label,
                                method: "llm",
                                rationale: r.rationale,
                            },
                        });
                        seen.add(r.id);
                    }
                }
                for (const n of batch) {
                    if (!seen.has(n.id)) {
                        out.set(n.id, {
                            ...n,
                            primacy: {
                                label: "unknown",
                                method: "llm",
                                rationale:
                                    "missing or duplicated in batch response",
                            },
                        });
                        errors.push(
                            recoveredError(
                                "primacy-judge",
                                `node ${n.id} missing/duplicated in LLM batch`,
                            ),
                        );
                    }
                }
            } catch (e) {
                for (const n of batch)
                    out.set(n.id, {
                        ...n,
                        primacy: {
                            label: "unknown",
                            method: "llm",
                            rationale: "batch failed",
                        },
                    });
                errors.push(
                    recoveredError(
                        "primacy-judge",
                        e instanceof Error ? e.message : String(e),
                    ),
                );
                emit({
                    agent: "primacy-judge",
                    phase: "recovery",
                    summary: `batch ${i / BATCH + 1} failed → unknown`,
                });
            }
        }

        const nodes = graph.nodes.map((n) => out.get(n.id) ?? n);
        const originCandidates = selectOrigins({ ...graph, nodes });
        emit({
            agent: "primacy-judge",
            phase: "handoff",
            summary: `origins: ${originCandidates.join(", ")}`,
            data: { originCandidates },
        });
        emit({
            agent: "primacy-judge",
            phase: "done",
            summary: `labeled ${nodes.length} nodes`,
        });
        return { nodes, originCandidates, errors };
    };
}

export const judgePrimacy: JudgePrimacy = makeJudgePrimacy(callStructured);
