import { describe, expect, it } from "vitest";
import type {
    CitationGraph,
    CitationNode,
    DriftFinding,
} from "@/core/run/domain";
import { scoreVerdict } from "../score";

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
    primacy: { label: "primary", method: "heuristic" },
    ...over,
});

const g = (
    nodes: CitationNode[],
    edges: CitationGraph["edges"] = [],
): CitationGraph => ({
    nodes,
    edges,
    truncated: false,
});

const drift = (over: Partial<DriftFinding> = {}): DriftFinding => ({
    workId: "W1",
    label: "supported",
    evidenceQuote: null,
    explanation: "x",
    basis: "fulltext",
    ...over,
});

describe("scoreVerdict", () => {
    it("gates to LOW on contradicted drift", () => {
        const r = scoreVerdict({
            graph: g([node("W1")]),
            cycles: [],
            driftFindings: [drift({ label: "contradicted" })],
        });
        expect(r.confidence).toBe("LOW");
        expect(r.score).toBeLessThanOrEqual(20);
        expect(r.pathogens).toContain("claim-drift");
    });

    it("gates to LOW on a cycle", () => {
        const r = scoreVerdict({
            graph: g([node("W1")]),
            cycles: [["W1", "W2", "W1"]],
            driftFindings: [],
        });
        expect(r.confidence).toBe("LOW");
        expect(r.pathogens).toContain("circular-support");
    });

    it("gates to LOW when no origin is primary (no-primary-source)", () => {
        const r = scoreVerdict({
            graph: g([
                node("W1", {
                    primacy: { label: "secondary", method: "heuristic" },
                }),
            ]),
            cycles: [],
            driftFindings: [],
        });
        expect(r.confidence).toBe("LOW");
        expect(r.pathogens).toContain("no-primary-source");
    });

    it("gates to LOW on a retracted node", () => {
        const r = scoreVerdict({
            graph: g([node("W1", { isRetracted: true })]),
            cycles: [],
            driftFindings: [],
        });
        expect(r.confidence).toBe("LOW");
    });

    it("clean primary chain, supported drift → HIGH", () => {
        const r = scoreVerdict({
            graph: g([node("W1"), node("W2")]),
            cycles: [],
            driftFindings: [drift({ label: "supported" })],
        });
        expect(r.confidence).toBe("HIGH");
        expect(r.score).toBeGreaterThanOrEqual(70);
        expect(r.pathogens).toEqual([]);
    });

    it("a lone drifted finding lands MEDIUM (not gated)", () => {
        const r = scoreVerdict({
            graph: g([node("W1"), node("W2")]),
            cycles: [],
            driftFindings: [drift({ label: "drifted" })],
        });
        expect(r.confidence).toBe("MEDIUM");
        expect(r.pathogens).toContain("claim-drift");
    });

    it("reports coverage and primaryRatio", () => {
        const nodes = [
            node("W1"),
            node("W2", { primacy: { label: "secondary", method: "llm" } }),
            node("W3", { fetchStatus: "unresolved", primacy: undefined }),
        ];
        const r = scoreVerdict({
            graph: g(nodes),
            cycles: [],
            driftFindings: [drift()],
        });
        expect(r.coverage).toEqual({ resolved: 2, total: 3 });
        expect(r.primaryRatio).toBeCloseTo(0.5); // 1 primary of 2 labeled
    });

    it("primaryRatio excludes unknown primacy labels", () => {
        const nodes = [
            node("W1"),
            node("W2", {
                primacy: { label: "secondary", method: "heuristic" },
            }),
            node("W3", { primacy: { label: "unknown", method: "heuristic" } }),
        ];
        const r = scoreVerdict({
            graph: g(nodes),
            cycles: [],
            driftFindings: [drift()],
        });
        expect(r.primaryRatio).toBe(0.5);
    });

    it("single-point-of-failure lowers score but stays un-gated", () => {
        const r = scoreVerdict({
            graph: g(
                [
                    node("W_ORIGIN", { type: "preprint" }),
                    node("W2"),
                    node("W3"),
                    node("W4"),
                ],
                [
                    { from: "W2", to: "W_ORIGIN" },
                    { from: "W3", to: "W_ORIGIN" },
                    { from: "W4", to: "W_ORIGIN" },
                ],
            ),
            cycles: [],
            driftFindings: [drift()],
        });
        expect(r.score).toBe(75);
        expect(r.confidence).toBe("HIGH");
        expect(r.pathogens).toContain("single-point-of-failure");
    });

    it("partially-supported drift applies 20 penalty without claim-drift pathogen", () => {
        const r = scoreVerdict({
            graph: g([node("W1"), node("W2")]),
            cycles: [],
            driftFindings: [drift({ label: "partially-supported" })],
        });
        expect(r.score).toBe(80);
        expect(r.confidence).toBe("HIGH");
        expect(r.pathogens).not.toContain("claim-drift");
    });
});
