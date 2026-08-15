import { describe, expect, it } from "vitest";
import { buildRunGraph } from "../graph";

describe("run graph skeleton", () => {
    it("runs all five agents and produces a verdict", async () => {
        const graph = buildRunGraph();
        const final = await graph.invoke({
            input: { kind: "claim", text: "spinach is rich in iron" },
        });

        expect(final.verdict).not.toBeNull();
        expect(final.anchors.length).toBeGreaterThan(0);
        expect(final.graph.nodes.length).toBeGreaterThan(0);

        const agents = final.trace.map((t) => t.agent);
        expect(agents).toEqual([
            "input-adapter",
            "chain-tracer",
            "primacy-judge",
            "drift-auditor",
            "verdict",
        ]);
    });

    // PrimacyJudge writes the labelled nodes back into state.graph, and the
    // verdict node must read that same graph — handing it ChainTracer's raw
    // output would leave every node unlabelled and sink every verdict to LOW.
    it("hands the verdict writer the primacy-labelled graph", async () => {
        const graph = buildRunGraph();
        const final = await graph.invoke({
            input: { kind: "claim", text: "spinach is rich in iron" },
        });

        expect(final.graph.nodes.length).toBeGreaterThan(0);
        for (const node of final.graph.nodes) {
            expect(node.primacy).toBeDefined();
        }
    });
});
