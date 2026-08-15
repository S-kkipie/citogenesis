import { describe, expect, it } from "vitest";
import { buildRunGraph, type LiveChunk } from "../graph";
import {
    auditDriftStub,
    judgePrimacyStub,
    resolveInputStub,
    traceChainStub,
    writeVerdictStub,
} from "../stubs";

/** Fake ports: exercises the graph's wiring without network or LLM calls. */
const stubPorts = {
    resolveInput: resolveInputStub,
    traceChain: traceChainStub,
    judgePrimacy: judgePrimacyStub,
    auditDrift: auditDriftStub,
    writeVerdict: writeVerdictStub,
};

describe("run graph skeleton", () => {
    it("runs all five agents and produces a verdict", async () => {
        const graph = buildRunGraph(stubPorts);
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
        const graph = buildRunGraph(stubPorts);
        const final = await graph.invoke({
            input: { kind: "claim", text: "spinach is rich in iron" },
        });

        expect(final.graph.nodes.length).toBeGreaterThan(0);
        for (const node of final.graph.nodes) {
            expect(node.primacy).toBeDefined();
        }
    });

    it("streams trace and delta chunks live via custom mode", async () => {
        const graph = buildRunGraph(stubPorts);
        const collected: Array<[string, unknown]> = [];
        const stream = await graph.stream(
            { input: { kind: "claim", text: "spinach is rich in iron" } },
            { streamMode: ["values", "custom"] },
        );
        for await (const chunk of stream) {
            collected.push(chunk as [string, unknown]);
        }

        const custom = collected
            .filter(([mode]) => mode === "custom")
            .map(([, c]) => c as LiveChunk);
        // trace events flow through the live channel...
        expect(custom.filter((c) => c.kind === "trace").length).toBeGreaterThan(
            0,
        );
        // ...and so do the stub deltas
        const deltaTypes = custom
            .filter((c) => c.kind === "delta")
            .map(
                (c) => (c as Extract<LiveChunk, { kind: "delta" }>).event.type,
            );
        expect(deltaTypes).toContain("claim-resolved");
        expect(deltaTypes).toContain("graph-delta");
        expect(deltaTypes).toContain("nodes-patch");
        expect(deltaTypes).toContain("origins");

        // values mode still carries the final persistable state, delta-free
        const values = collected.filter(([mode]) => mode === "values");
        const final = values.at(-1)?.[1] as {
            verdict: unknown;
            trace: unknown[];
        };
        expect(final.verdict).not.toBeNull();
        expect(final.trace.length).toBeGreaterThan(0);
    });
});
