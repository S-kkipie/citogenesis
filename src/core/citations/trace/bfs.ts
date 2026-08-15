import type { DeltaEmit } from "../../run/domain/delta";
import type {
    CitationEdge,
    CitationGraph,
    CitationNode,
    TraceBudget,
    WorkId,
} from "../../run/domain/graph";
import type { RunError } from "../../run/domain/state";
import type { TraceEmit } from "../../run/domain/trace";
import { unresolvedNode } from "../nodes";
import type { FetchedWork } from "../types";
import { findCycles } from "./cycles";
import { prioritizeRefs, type RefCandidate } from "./prioritize";

export type FetchWorksFn = (
    ids: WorkId[],
) => Promise<{ works: Map<WorkId, FetchedWork>; missing: WorkId[] }>;

export type TraceBudgetInput = { [K in keyof TraceBudget]: number };

export async function traceChainWith(
    anchors: WorkId[],
    budget: TraceBudgetInput,
    emit: TraceEmit,
    fetchWorks: FetchWorksFn,
    emitDelta?: DeltaEmit,
): Promise<{ graph: CitationGraph; cycles: WorkId[][]; errors: RunError[] }> {
    emit({
        agent: "chain-tracer",
        phase: "start",
        summary: `Tracing ${anchors.length} anchor(s)`,
        data: { anchors },
    });

    const nodes = new Map<WorkId, CitationNode>();
    const edges: CitationEdge[] = [];
    const errors: RunError[] = [];
    const fetched = new Map<WorkId, FetchedWork>();
    const known = new Set<WorkId>(); // fetched-or-marked-unresolved (metadata cache guard)
    let truncated = false;

    const fetchMeta = async (ids: WorkId[]): Promise<void> => {
        const need = ids.filter((id) => !known.has(id));
        if (need.length === 0) return;
        let works: Map<WorkId, FetchedWork>;
        let missing: WorkId[];
        try {
            ({ works, missing } = await fetchWorks(need));
        } catch (err) {
            works = new Map();
            missing = need;
            for (const id of missing) {
                known.add(id);
                emit({
                    agent: "chain-tracer",
                    phase: "recovery",
                    summary: `Node ${id} unresolved (fetch error)`,
                    data: { id },
                });
            }
            errors.push({
                agent: "chain-tracer",
                recovered: true,
                message: `Fetch error for ${missing.length} node(s): ${err instanceof Error ? err.message : String(err)}`,
            });
            return;
        }
        for (const [id, fw] of works) {
            fetched.set(id, fw);
            known.add(id);
        }
        for (const id of missing) {
            known.add(id);
            emit({
                agent: "chain-tracer",
                phase: "recovery",
                summary: `Node ${id} unresolved (no data source)`,
                data: { id },
            });
        }
        if (missing.length > 0) {
            errors.push({
                agent: "chain-tracer",
                recovered: true,
                message: `${missing.length} node(s) unresolved: ${missing.join(", ")}`,
            });
        }
    };

    const commit = (id: WorkId, depth: number): void => {
        if (nodes.has(id)) return;
        const fw = fetched.get(id);
        nodes.set(id, fw ? { ...fw.node, depth } : unresolvedNode(id, depth));
    };

    await fetchMeta(anchors);
    for (const a of anchors) commit(a, 0);

    const anchorNodes = anchors
        .map((a) => nodes.get(a))
        .filter((n) => n !== undefined);
    if (anchorNodes.length > 0) {
        emitDelta?.({ type: "graph-delta", nodes: anchorNodes, edges: [] });
    }

    const claimTopics = new Set<string>();
    for (const a of anchors) {
        // biome-ignore lint/suspicious/useIterableCallbackReturn: Set.add mutates the accumulator; its returned set is intentionally ignored.
        fetched.get(a)?.topicIds.forEach((t) => claimTopics.add(t));
    }

    let frontier = anchors.filter((a) => fetched.has(a));
    for (let depth = 0; depth < budget.maxDepth; depth++) {
        const next: WorkId[] = [];
        for (const parentId of frontier) {
            const fw = fetched.get(parentId);
            if (!fw || fw.referencedWorks.length === 0) continue;

            await fetchMeta(fw.referencedWorks);

            const cands: RefCandidate[] = fw.referencedWorks.map((id) => {
                const c = fetched.get(id);
                return c
                    ? { id, topicIds: c.topicIds, year: c.node.year }
                    : { id, topicIds: [], year: null };
            });
            const kept = prioritizeRefs(
                cands,
                claimTopics,
                budget.maxRefsPerNode,
            );

            if (kept.length < fw.referencedWorks.length) {
                truncated = true;
                emit({
                    agent: "chain-tracer",
                    phase: "progress",
                    summary: `${parentId} expanded ${kept.length}/${fw.referencedWorks.length} refs`,
                });
            }

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

            if (nodes.size >= budget.maxNodes) {
                truncated = true;
                emit({
                    agent: "chain-tracer",
                    phase: "progress",
                    summary: `Node budget ${budget.maxNodes} reached; stopping expansion`,
                });
                break;
            }
        }
        frontier = next;
        if (frontier.length === 0 || nodes.size >= budget.maxNodes) break;
    }

    const graph: CitationGraph = {
        nodes: [...nodes.values()],
        edges,
        truncated,
    };
    const cycles = findCycles(graph);
    if (cycles.length > 0) {
        emitDelta?.({ type: "cycles", cycles });
    }
    emit({
        agent: "chain-tracer",
        phase: "done",
        summary: `Graph: ${graph.nodes.length} nodes, ${edges.length} edges, ${cycles.length} cycle(s)`,
        data: {
            nodes: graph.nodes.length,
            edges: edges.length,
            cycles: cycles.length,
        },
    });
    return { graph, cycles, errors };
}
