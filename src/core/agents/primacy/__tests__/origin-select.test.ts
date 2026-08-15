import { describe, expect, it } from "vitest";
import type { CitationGraph, CitationNode } from "@/core/run/domain";
import { selectOrigins } from "../origin-select";

const node = (id: string, over: Partial<CitationNode> = {}): CitationNode => ({
    id,
    title: id,
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: null,
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth: 1,
    source: "openalex",
    fetchStatus: "resolved",
    ...over,
});

// A,B,C cite ORIGIN (sink). D cites A only.
const graph: CitationGraph = {
    nodes: [node("W1"), node("W2"), node("W3"), node("WORIGIN"), node("WLEAF")],
    edges: [
        { from: "W1", to: "WORIGIN" },
        { from: "W2", to: "WORIGIN" },
        { from: "W3", to: "WORIGIN" },
        { from: "WLEAF", to: "W1" },
        { from: "W1", to: "W2" },
    ],
    truncated: false,
};

describe("selectOrigins", () => {
    it("picks the highest fan-in sink first", () => {
        const origins = selectOrigins(graph, 3);
        expect(origins[0]).toBe("WORIGIN"); // 3 papers cite it, references nothing
    });

    it("caps at the limit", () => {
        expect(selectOrigins(graph, 1)).toHaveLength(1);
    });

    it("falls back to deepest nodes when the graph is fully cyclic", () => {
        const cyclic: CitationGraph = {
            nodes: [node("A", { depth: 1 }), node("B", { depth: 2 })],
            edges: [
                { from: "A", to: "B" },
                { from: "B", to: "A" },
            ],
            truncated: false,
        };
        expect(selectOrigins(cyclic, 3).length).toBeGreaterThan(0);
    });
});
