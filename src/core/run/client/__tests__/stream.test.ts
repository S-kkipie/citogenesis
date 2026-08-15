import { describe, expect, it } from "vitest";
import type {
    CitationNode,
    RunInput,
    RunSseEvent,
    Verdict,
} from "@/core/run/domain";

import { initialLiveView, liveRunState, streamReducer } from "../stream";

const fold = (events: RunSseEvent[]) =>
    events.reduce(streamReducer, initialLiveView());

describe("streamReducer", () => {
    it("records runId on accepted", () => {
        expect(fold([{ type: "accepted", runId: "r1" }]).runId).toBe("r1");
    });

    it("flips agent to running on a start trace, done on a done trace", () => {
        const v = fold([
            { type: "accepted", runId: "r1" },
            {
                type: "trace",
                event: {
                    ts: "t",
                    agent: "chain-tracer",
                    phase: "start",
                    summary: "go",
                },
            },
        ]);
        expect(v.agents["chain-tracer"]).toBe("running");
        const v2 = streamReducer(v, {
            type: "trace",
            event: {
                ts: "t",
                agent: "chain-tracer",
                phase: "done",
                summary: "done",
            },
        });
        expect(v2.agents["chain-tracer"]).toBe("done");
        expect(v2.trace).toHaveLength(2);
    });

    it("marks recovered on a recovery phase", () => {
        const v = fold([
            {
                type: "trace",
                event: {
                    ts: "t",
                    agent: "drift-auditor",
                    phase: "recovery",
                    summary: "fallback",
                },
            },
        ]);
        expect(v.agents["drift-auditor"]).toBe("recovered");
    });

    it("captures verdict + marks all agents done on done", () => {
        const verdict: Verdict = {
            confidence: "LOW",
            score: 0,
            pathogens: [],
            primaryRatio: 0,
            coverage: { resolved: 1, total: 1 },
            prose: "x",
        };
        const v = fold([
            { type: "accepted", runId: "r1" },
            { type: "done", runId: "r1", verdict },
        ]);
        expect(v.terminal).toBe("done");
        expect(v.verdict?.confidence).toBe("LOW");
        expect(v.agents.verdict).toBe("done");
    });

    it("captures failure message on failed", () => {
        const v = fold([{ type: "failed", runId: "r1", message: "boom" }]);
        expect(v.terminal).toBe("failed");
        expect(v.failureMessage).toBe("boom");
    });
});

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

describe("streamReducer deltas", () => {
    it("accumulates graph-deltas, deduping nodes and edges", () => {
        const v = fold([
            {
                type: "graph-delta",
                nodes: [node("W1")],
                edges: [],
            },
            {
                type: "graph-delta",
                nodes: [node("W1"), node("W2", 1)],
                edges: [
                    { from: "W1", to: "W2" },
                    { from: "W1", to: "W2" },
                ],
            },
        ]);
        expect(v.partial.graph.nodes.map((n) => n.id)).toEqual(["W1", "W2"]);
        expect(v.partial.graph.edges).toEqual([{ from: "W1", to: "W2" }]);
    });

    it("patches primacy in place via nodes-patch", () => {
        const v = fold([
            { type: "graph-delta", nodes: [node("W1")], edges: [] },
            {
                type: "nodes-patch",
                patches: [
                    {
                        id: "W1",
                        primacy: { label: "primary", method: "heuristic" },
                    },
                ],
            },
        ]);
        expect(v.partial.graph.nodes[0].primacy?.label).toBe("primary");
    });

    it("records claim, origins, cycles and drift findings", () => {
        const finding = {
            workId: "W1",
            label: "drifted" as const,
            evidenceQuote: null,
            explanation: "e",
            basis: "abstract" as const,
        };
        const v = fold([
            { type: "claim-resolved", claim: "c", anchors: ["W1"] },
            { type: "origins", ids: ["W1"] },
            { type: "cycles", cycles: [["W1", "W2"]] },
            { type: "drift-finding", finding },
        ]);
        expect(v.partial.claim).toBe("c");
        expect(v.partial.anchors).toEqual(["W1"]);
        expect(v.partial.originCandidates).toEqual(["W1"]);
        expect(v.partial.cycles).toEqual([["W1", "W2"]]);
        expect(v.partial.driftFindings).toEqual([finding]);
    });

    it("a re-audited origin replaces its previous drift finding", () => {
        const first = {
            workId: "W1",
            label: "drifted" as const,
            evidenceQuote: null,
            explanation: "e1",
            basis: "abstract" as const,
        };
        const second = { ...first, explanation: "e2" };
        const v = fold([
            { type: "drift-finding", finding: first },
            { type: "drift-finding", finding: second },
        ]);
        expect(v.partial.driftFindings).toEqual([second]);
    });
});

describe("liveRunState", () => {
    const input: RunInput = { kind: "claim", text: "spinach is rich in iron" };

    it("is null before any node arrives", () => {
        expect(liveRunState(initialLiveView(), input)).toBeNull();
    });

    it("mirrors the partial once nodes exist", () => {
        const v = fold([
            { type: "claim-resolved", claim: "c", anchors: ["W1"] },
            { type: "graph-delta", nodes: [node("W1")], edges: [] },
        ]);
        const s = liveRunState(v, input);
        expect(s?.claim).toBe("c");
        expect(s?.graph.nodes.map((n) => n.id)).toEqual(["W1"]);
        expect(s?.verdict).toBeNull();
        expect(s?.errors).toEqual([]);
    });
});
