import { describe, expect, it } from "vitest";

import { sampleState } from "../fixtures/sample-run";
import { deriveGraphView, worstDriftOrigin } from "../graph-view";

const view = () => deriveGraphView(sampleState);

const byId = (id: string) => {
    const found = view().nodes.find((n) => n.node.id === id);
    if (!found) {
        throw new Error(`Missing node id ${id}`);
    }
    return found;
};

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
});
