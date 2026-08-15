import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CitationGraph, CitationNode } from "@/core/run/domain";

// `write-verdict.ts` imports `callStructured`, which imports the Gemini
// client singleton reading `ServerConfig` (validated env) at module-load
// time. The shared vitest env block doesn't set GEMINI_API_KEY/
// OPENALEX_MAILTO. Stub throwaway values before the dynamic import below;
// both tests inject a fake `call`, so `getGenAI()` is never actually called
// and the real key is never touched. Mirrors
// src/core/agents/gemini/__tests__/call-structured.test.ts.
process.env.GEMINI_API_KEY ??= "test-gemini-api-key";
process.env.OPENALEX_MAILTO ??= "test@example.com";

const { makeWriteVerdict } = await import("../write-verdict");
const { scoreVerdict } = await import("../score");

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
const graph: CitationGraph = {
    nodes: [node("W1"), node("W2")],
    edges: [],
    truncated: false,
};
const emit = vi.fn();

beforeEach(() => {
    emit.mockClear();
});

describe("writeVerdict", () => {
    it("returns a full Verdict with LLM prose and code-computed numbers, and never lets the LLM touch the numbers", async () => {
        const call = vi.fn(async () => ({
            data: { prose: "Solid primary support." },
            usage: { prompt: 0, output: 0, total: 0 },
            latencyMs: 1,
        }));
        const write = makeWriteVerdict(call as never);
        const v = await write(
            { claim: "c", graph, cycles: [], driftFindings: [], errors: [] },
            emit,
        );

        // Pin the exact deterministic numbers for this fixture (two nodes,
        // both default primacy "primary", no edges, no cycles, no drift
        // findings): score 100, HIGH, no pathogens, full primary ratio,
        // full coverage. Also cross-checked against scoreVerdict directly so
        // the assertion can't silently drift from Task 4's own contract.
        const expectedScore = scoreVerdict({
            graph,
            cycles: [],
            driftFindings: [],
        });
        expect(v).toEqual({
            ...expectedScore,
            prose: "Solid primary support.",
        });
        expect(v.score).toBe(100);
        expect(v.confidence).toBe("HIGH");
        expect(v.pathogens).toEqual([]);
        expect(v.primaryRatio).toBe(1);
        expect(v.coverage).toEqual({ resolved: 2, total: 2 });
        expect(v.prose).toBe("Solid primary support.");

        const phases = emit.mock.calls.map(([e]) => e.phase);
        expect(phases).toContain("start");
        expect(phases).toContain("progress");
        expect(phases).toContain("done");
        expect(phases).not.toContain("recovery");
    });

    it("falls back to templated prose when the LLM call fails, emitting a recovery trace event", async () => {
        const call = vi.fn(async () => {
            throw new Error("boom");
        });
        const write = makeWriteVerdict(call as never);
        const v = await write(
            { claim: "c", graph, cycles: [], driftFindings: [], errors: [] },
            emit,
        );
        expect(v.prose).toContain("Confidence HIGH");
        expect(v.confidence).toBe("HIGH");

        const phases = emit.mock.calls.map(([e]) => e.phase);
        expect(phases).toContain("start");
        expect(phases).toContain("progress");
        expect(phases).toContain("done");
        expect(phases).toContain("recovery");
        expect(emit.mock.calls.some(([e]) => e.phase === "recovery")).toBe(
            true,
        );
    });
});
