import type { CitationGraph, WorkId } from "@/core/run/domain";

/** Chain roots the support converges on. Edges are `from cites to`; a root is a
 * sink (out-degree 0 — references nothing else we traced). Rank by fan-in
 * (papers citing it), then citedByCount, then prefer nodes with OA full text. */
export function selectOrigins(graph: CitationGraph, limit = 3): WorkId[] {
    const outDeg = new Map<WorkId, number>();
    const inDeg = new Map<WorkId, number>();

    for (const n of graph.nodes) {
        outDeg.set(n.id, 0);
        inDeg.set(n.id, 0);
    }

    for (const e of graph.edges) {
        outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
        inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }

    const resolved = graph.nodes.filter((n) => n.fetchStatus === "resolved");
    let roots = resolved.filter((n) => (outDeg.get(n.id) ?? 0) === 0);

    if (roots.length === 0) {
        if (resolved.length === 0) return [];
        const maxDepth = Math.max(...resolved.map((n) => n.depth), 0);
        roots = resolved.filter((n) => n.depth === maxDepth);
    }

    return roots
        .sort(
            (a, b) =>
                (inDeg.get(b.id) ?? 0) - (inDeg.get(a.id) ?? 0) ||
                b.citedByCount - a.citedByCount ||
                Number(!!b.oaUrl) - Number(!!a.oaUrl),
        )
        .slice(0, limit)
        .map((n) => n.id);
}
