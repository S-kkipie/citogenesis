import { describe, expect, it } from "vitest";
import type { CitationNode, DeltaEvent, WorkId } from "@/core/run/domain";
import type { FetchedWork } from "../../types";
import { type FetchWorksFn, traceChainWith } from "../bfs";

const node = (id: WorkId, depth = 0): CitationNode => ({
    id,
    title: `Paper ${id}`,
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: null,
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth,
    source: "openalex",
    fetchStatus: "resolved",
});

const fw = (id: WorkId, refs: WorkId[] = []): FetchedWork => ({
    node: node(id),
    referencedWorks: refs,
    topicIds: [],
});

const CORPUS: Record<string, FetchedWork> = {
    W1: fw("W1", ["W2", "W3"]),
    W2: fw("W2"),
    W3: fw("W3"),
};

const fetchWorks: FetchWorksFn = async (ids) => {
    const works = new Map(
        ids.filter((id) => id in CORPUS).map((id) => [id, CORPUS[id]]),
    );
    return { works, missing: ids.filter((id) => !(id in CORPUS)) };
};

const BUDGET = { maxDepth: 2, maxRefsPerNode: 5, maxNodes: 10 };

describe("traceChainWith deltas", () => {
    it("emits anchors first, then one graph-delta per expansion", async () => {
        const deltas: DeltaEvent[] = [];
        const { graph } = await traceChainWith(
            ["W1"],
            BUDGET,
            () => {},
            fetchWorks,
            (e) => deltas.push(e),
        );

        const graphDeltas = deltas.filter((d) => d.type === "graph-delta");
        expect(graphDeltas.length).toBe(2);
        // anchors land as the first delta, no edges yet
        expect(graphDeltas[0].nodes.map((n) => n.id)).toEqual(["W1"]);
        expect(graphDeltas[0].edges).toEqual([]);
        // W1's expansion: children + both edges in one batch
        expect(graphDeltas[1].nodes.map((n) => n.id).sort()).toEqual([
            "W2",
            "W3",
        ]);
        expect(graphDeltas[1].edges).toEqual([
            { from: "W1", to: "W2" },
            { from: "W1", to: "W3" },
        ]);
        // streamed nodes ≡ final graph nodes (nothing missing, no dupes)
        const streamed = graphDeltas.flatMap((d) => d.nodes.map((n) => n.id));
        expect(streamed.sort()).toEqual(graph.nodes.map((n) => n.id).sort());
        // no cycles in this corpus → no cycles event
        expect(deltas.some((d) => d.type === "cycles")).toBe(false);
    });

    it("emits a cycles event when the corpus has one", async () => {
        const cyclic: Record<string, FetchedWork> = {
            W1: fw("W1", ["W2"]),
            W2: fw("W2", ["W1"]),
        };
        const fetchCyclic: FetchWorksFn = async (ids) => ({
            works: new Map(
                ids.filter((id) => id in cyclic).map((id) => [id, cyclic[id]]),
            ),
            missing: [],
        });
        const deltas: DeltaEvent[] = [];
        await traceChainWith(
            ["W1"],
            BUDGET,
            () => {},
            fetchCyclic,
            (e) => deltas.push(e),
        );
        const cycles = deltas.find((d) => d.type === "cycles");
        expect(cycles).toBeDefined();
        expect(cycles?.cycles.length).toBeGreaterThan(0);
    });

    it("still works with no emitDelta (param optional)", async () => {
        const { graph } = await traceChainWith(
            ["W1"],
            BUDGET,
            () => {},
            fetchWorks,
        );
        expect(graph.nodes.length).toBe(3);
    });
});
