import Graph from "graphology";
import { describe, expect, it } from "vitest";
import type { GraphView, NodeView } from "@/core/run/client/graph-view";
import type { CitationNode } from "@/core/run/domain";
import { syncGraph } from "../graph-sync";

const node = (id: string, depth = 0): CitationNode => ({
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

const nv = (
    id: string,
    depth = 0,
    severity: NodeView["severity"] = "neutral",
): NodeView => ({
    node: node(id, depth),
    shape: "dashed",
    severity,
    isOrigin: false,
    inCycle: false,
    pathogens: [],
});

const viewOf = (
    nodes: NodeView[],
    edges: Array<[string, string]>,
): GraphView => ({
    nodes,
    edges: edges.map(([from, to]) => ({
        id: `${from}->${to}`,
        edge: { from, to },
        kind: "citation" as const,
    })),
    truncated: false,
});

describe("syncGraph", () => {
    it("adds nodes and edges incrementally without dropping existing ones", () => {
        const g = new Graph({ multi: false, type: "directed" });
        syncGraph(g, viewOf([nv("W1")], []));
        expect(g.order).toBe(1);

        syncGraph(g, viewOf([nv("W1"), nv("W2", 1)], [["W1", "W2"]]));
        expect(g.order).toBe(2);
        expect(g.size).toBe(1);
        expect(g.hasEdge("W1->W2")).toBe(true);
    });

    it("updates attributes of existing nodes (recolor on severity change)", () => {
        const g = new Graph({ multi: false, type: "directed" });
        syncGraph(g, viewOf([nv("W1")], []));
        const before = g.getNodeAttribute("W1", "color");
        syncGraph(g, viewOf([nv("W1", 0, "flagged")], []));
        const after = g.getNodeAttribute("W1", "color");
        expect(after).not.toBe(before);
        expect(g.order).toBe(1);
    });

    it("drops nodes and edges absent from the view", () => {
        const g = new Graph({ multi: false, type: "directed" });
        syncGraph(g, viewOf([nv("W1"), nv("W2", 1)], [["W1", "W2"]]));
        syncGraph(g, viewOf([nv("W1")], []));
        expect(g.order).toBe(1);
        expect(g.size).toBe(0);
    });

    it("gives every node a position", () => {
        const g = new Graph({ multi: false, type: "directed" });
        syncGraph(g, viewOf([nv("W1"), nv("W2", 1)], [["W1", "W2"]]));
        for (const id of g.nodes()) {
            expect(typeof g.getNodeAttribute(id, "x")).toBe("number");
            expect(typeof g.getNodeAttribute(id, "y")).toBe("number");
        }
    });
});
