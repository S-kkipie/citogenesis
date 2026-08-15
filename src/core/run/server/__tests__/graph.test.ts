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
});
