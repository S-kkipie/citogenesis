import { describe, expect, it } from "vitest";
import type { RunState } from "@/core/run/domain";

import { node, sampleState } from "../fixtures/sample-run";
import { deriveGraphView, worstDriftOrigin } from "../graph-view";

const view = () => deriveGraphView(sampleState);

const byId = (id: string) => {
    const found = view().nodes.find((n) => n.node.id === id);
    if (!found) {
        throw new Error(`Missing node id ${id}`);
    }
    return found;
};

function minimalState(over: Partial<RunState>): RunState {
    return {
        input: { kind: "claim", text: "edge case state" },
        claim: "edge case state",
        anchors: ["W1"],
        graph: { nodes: [], edges: [], truncated: false },
        cycles: [],
        originCandidates: [],
        driftFindings: [],
        verdict: null,
        trace: [],
        errors: [],
        ...over,
    } as RunState;
}

describe("deriveGraphView", () => {
    it("shapes nodes by primacy and fetch status", () => {
        expect(byId("W5").shape).toBe("solid"); // primary
        expect(byId("W2").shape).toBe("ring"); // secondary
        expect(byId("W3").shape).toBe("dashed"); // unresolved
    });

    it("flags cycle members", () => {
        expect(byId("W6").inCycle).toBe(true);
        expect(byId("W6").severity).toBe("flagged");
        expect(byId("W6").pathogens).toContain("circular-support");
    });

    it("flags drifted/contradicted and retracted origins", () => {
        expect(byId("W4").severity).toBe("flagged"); // contradicted + retracted + SPOF
        expect(byId("W4").pathogens).toContain("claim-drift");
        expect(byId("W4").pathogens).toContain("single-point-of-failure");
    });

    it("cautions partial drift and unresolved", () => {
        // W5 is a primary origin, but first-match ordering hits the caution rule
        // (partially-supported drift) before the healthy rule. Intentional per spec §3.1.
        expect(byId("W5").severity).toBe("caution");
        expect(byId("W3").severity).toBe("caution"); // unresolved
    });

    it("marks cycle edges", () => {
        const cycleEdge = view().edges.find(
            (e) => e.edge.from === "W6" && e.edge.to === "W2",
        );
        expect(cycleEdge?.kind).toBe("cycle");
    });

    it("marks support-path edges into origins", () => {
        const toOrigin = view().edges.find((e) => e.edge.to === "W5");
        expect(toOrigin?.kind).toBe("support-path");
    });

    it("propagates truncated", () => {
        expect(view().truncated).toBe(true);
    });

    it("picks the worst drift origin (contradicted over partial)", () => {
        expect(worstDriftOrigin(sampleState)).toBe("W4");
    });

    it("marks a clean primary origin healthy", () => {
        expect(byId("W7").severity).toBe("healthy");
    });

    it("flags a drifted node and tags claim-drift", () => {
        expect(byId("W8").severity).toBe("flagged");
        expect(byId("W8").pathogens).toContain("claim-drift");
    });

    it("flags a fragile (preprint) SPOF origin but not a clean-article SPOF origin", () => {
        const st = minimalState({
            graph: {
                nodes: [
                    node("P1", 1, {
                        type: "preprint",
                        primacy: { label: "primary", method: "llm" },
                    }),
                    node("A1", 1, {
                        type: "article",
                        primacy: { label: "primary", method: "heuristic" },
                    }),
                ],
                edges: [],
                truncated: false,
            },
            originCandidates: ["P1", "A1"],
            verdict: {
                confidence: "LOW",
                score: 10,
                pathogens: ["single-point-of-failure"],
                primaryRatio: 1,
                coverage: {
                    resolved: 2,
                    total: 2,
                },
                prose: "x",
            },
        });
        const v = deriveGraphView(st);
        const get = (id: string) => {
            const found = v.nodes.find((n) => n.node.id === id);
            if (!found) {
                throw new Error(`Missing node id ${id}`);
            }
            return found;
        };

        expect(get("P1").severity).toBe("flagged");
        expect(get("P1").pathogens).toContain("single-point-of-failure");
        expect(get("A1").severity).toBe("healthy");
        expect(get("A1").pathogens).not.toContain("single-point-of-failure");
    });

    it("cautions an origin implicated only by no-primary-source", () => {
        const st = minimalState({
            graph: {
                nodes: [
                    node("S1", 1, {
                        primacy: {
                            label: "secondary",
                            method: "heuristic",
                        },
                    }),
                ],
                edges: [],
                truncated: false,
            },
            originCandidates: ["S1"],
            verdict: {
                confidence: "LOW",
                score: 10,
                pathogens: ["no-primary-source"],
                primaryRatio: 0,
                coverage: {
                    resolved: 1,
                    total: 1,
                },
                prose: "x",
            },
        });
        const v = deriveGraphView(st);

        expect(v.nodes[0].severity).toBe("caution");
        expect(v.nodes[0].pathogens).toContain("no-primary-source");
    });
});
