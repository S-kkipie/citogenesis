import { describe, expect, it } from "vitest";
import type { RunSseEvent, Verdict } from "@/core/run/domain";

import { initialLiveView, streamReducer } from "../stream";

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
