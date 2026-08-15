import { describe, expect, it, vi } from "vitest";
import type { CitationGraph, CitationNode } from "@/core/run/domain";

// `judge-primacy.ts` imports `callStructured`, which imports the Gemini
// client singleton, which reads `ServerConfig` (validated env) at
// module-load time. The shared vitest env block only sets
// DATABASE_URL/BETTER_AUTH_SECRET/NEXT_PUBLIC_APP_URL — no existing test
// previously imported far enough to need GEMINI_API_KEY or OPENALEX_MAILTO.
// Stub throwaway values before the dynamic import below; every test here
// injects a fake `call` via `makeJudgePrimacy`, so the real `callStructured`
// (and the real Gemini client) is never actually invoked.
process.env.GEMINI_API_KEY ??= "test-gemini-api-key";
process.env.OPENALEX_MAILTO ??= "test@example.com";

const { makeJudgePrimacy } = await import("../judge-primacy");

const node = (
    id: string,
    type: string,
    over: Partial<CitationNode> = {},
): CitationNode => ({
    id,
    title: id,
    year: 2020,
    doi: null,
    type,
    venue: null,
    authors: [],
    abstract: "a",
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth: 1,
    source: "openalex",
    fetchStatus: "resolved",
    ...over,
});
const emit = vi.fn();

describe("judgePrimacy", () => {
    it("labels via heuristics without calling the LLM", async () => {
        const call = vi.fn();
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = {
            nodes: [node("W1", "review"), node("W2", "dataset")],
            edges: [],
            truncated: false,
        };
        const { nodes } = await judge(graph, emit);
        expect(call).not.toHaveBeenCalled();
        expect(nodes.find((n) => n.id === "W1")?.primacy).toMatchObject({
            label: "secondary",
            method: "heuristic",
        });
        expect(nodes.find((n) => n.id === "W2")?.primacy?.label).toBe(
            "primary",
        );
    });

    it("sends ambiguous nodes to the LLM and stamps method:llm", async () => {
        const call = vi.fn(async () => ({
            data: {
                results: [
                    { id: "W3", label: "primary", rationale: "orig data" },
                ],
            },
            usage: { prompt: 0, output: 0, total: 0 },
            latencyMs: 1,
        }));
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = {
            nodes: [node("W3", "article")],
            edges: [],
            truncated: false,
        };
        const { nodes } = await judge(graph, emit);
        expect(call).toHaveBeenCalledOnce();
        expect(nodes[0].primacy).toMatchObject({
            label: "primary",
            method: "llm",
        });
    });

    it("marks ids missing from the LLM response as unknown + records a recovered error", async () => {
        const call = vi.fn(async () => ({
            data: { results: [] },
            usage: { prompt: 0, output: 0, total: 0 },
            latencyMs: 1,
        }));
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = {
            nodes: [node("W4", "article")],
            edges: [],
            truncated: false,
        };
        const { nodes, errors } = await judge(graph, emit);
        expect(nodes[0].primacy).toMatchObject({
            label: "unknown",
            method: "llm",
        });
        expect(errors.some((e) => e.recovered)).toBe(true);
    });

    it("continues (unknown) when the LLM call throws", async () => {
        const call = vi.fn(async () => {
            throw new Error("boom");
        });
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = {
            nodes: [node("W5", "article")],
            edges: [],
            truncated: false,
        };
        const { nodes, errors } = await judge(graph, emit);
        expect(nodes[0].primacy?.label).toBe("unknown");
        expect(errors.length).toBeGreaterThan(0);
    });

    it("ignores a result id that belongs to another node, not the current batch", async () => {
        const call = vi.fn(async () => ({
            data: {
                results: [
                    { id: "W_A", label: "primary", rationale: "orig data" },
                    { id: "W_B", label: "primary", rationale: "hallucinated" },
                ],
            },
            usage: { prompt: 0, output: 0, total: 0 },
            latencyMs: 1,
        }));
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = {
            nodes: [node("W_A", "article"), node("W_B", "review")],
            edges: [],
            truncated: false,
        };
        const { nodes } = await judge(graph, emit);
        expect(nodes.find((n) => n.id === "W_A")?.primacy).toMatchObject({
            label: "primary",
            method: "llm",
        });
        expect(nodes.find((n) => n.id === "W_B")?.primacy).toMatchObject({
            label: "secondary",
            method: "heuristic",
        });
    });
});
