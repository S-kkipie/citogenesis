import type { CitationGraph, WorkId } from "../../run/domain/graph";

export function findCycles(graph: CitationGraph): WorkId[][] {
    const adj = new Map<WorkId, WorkId[]>();
    for (const n of graph.nodes) adj.set(n.id, []);
    const selfLoops = new Set<WorkId>();
    for (const e of graph.edges) {
        if (e.from === e.to) selfLoops.add(e.from);
        adj.get(e.from)?.push(e.to);
    }

    let index = 0;
    const idx = new Map<WorkId, number>();
    const low = new Map<WorkId, number>();
    const onStack = new Set<WorkId>();
    const stack: WorkId[] = [];
    const sccs: WorkId[][] = [];

    const strongconnect = (v: WorkId): void => {
        idx.set(v, index);
        low.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
        for (const w of adj.get(v) ?? []) {
            if (!idx.has(w)) {
                strongconnect(w);
                // biome-ignore lint/style/noNonNullAssertion: Tarjan's DFS invariant sets low-link values for both visited vertices.
                low.set(v, Math.min(low.get(v)!, low.get(w)!));
            } else if (onStack.has(w)) {
                // biome-ignore lint/style/noNonNullAssertion: An on-stack vertex has already been assigned an index.
                low.set(v, Math.min(low.get(v)!, idx.get(w)!));
            }
        }
        if (low.get(v) === idx.get(v)) {
            const comp: WorkId[] = [];
            let w: WorkId;
            do {
                // biome-ignore lint/style/noNonNullAssertion: The active SCC stack is non-empty while popping this component.
                w = stack.pop()!;
                onStack.delete(w);
                comp.push(w);
            } while (w !== v);
            if (comp.length > 1 || selfLoops.has(v)) sccs.push(comp);
        }
    };

    for (const n of graph.nodes) if (!idx.has(n.id)) strongconnect(n.id);

    const canonicalized = sccs
        .map((component) => [...component].sort((a, b) => a.localeCompare(b)))
        .sort((a, b) => a[0].localeCompare(b[0]));

    return canonicalized;
}
