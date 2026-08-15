// src/core/citations/__tests__/smoke.live.test.ts
import { describe, expect, it } from "vitest";
import { TRACE_BUDGET } from "../../run/domain/graph";

const live = process.env.LIVE_OPENALEX === "1" ? describe : describe.skip;

live("live OpenAlex smoke (depth 1)", () => {
    it("resolves a known paper and traces one level", async () => {
        const { resolveInput, traceChain } = await import("../index");
        const events: unknown[] = [];
        const emit = (e: unknown) => events.push(e);
        const { anchors } = await resolveInput(
            { kind: "paper", id: "W2741809807" },
            emit as never,
        );
        expect(anchors.length).toBeGreaterThan(0);
        const { graph } = await traceChain(
            anchors,
            { ...TRACE_BUDGET, maxDepth: 1 },
            emit as never,
        );
        expect(graph.nodes.length).toBeGreaterThan(1);
    }, 30_000);
});
