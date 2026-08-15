import { describe, expect, it, vi } from "vitest";
import type { CitationNode, DeltaEvent } from "@/core/run/domain";

// `audit-drift.ts` imports `callStructured`, which imports the Gemini client
// singleton reading `ServerConfig` (validated env) at module-load time. The
// shared vitest env block doesn't set GEMINI_API_KEY/OPENALEX_MAILTO. Every
// test here injects a fake `call`/`resolve`, so the real client is never
// touched — stub throwaway values before the dynamic import below.
process.env.GEMINI_API_KEY ??= "test-gemini-api-key";
process.env.OPENALEX_MAILTO ??= "test@example.com";

const { makeAuditDrift } = await import("../audit-drift");

const node = (id: string, over: Partial<CitationNode> = {}): CitationNode => ({
    id,
    title: id,
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: "abs",
    citedByCount: 0,
    isRetracted: false,
    oaUrl: "http://x/y.pdf",
    depth: 2,
    source: "openalex",
    fetchStatus: "resolved",
    ...over,
});
const emit = vi.fn();
const answer = (label: string) => ({
    data: { label, evidenceQuote: "q", explanation: "e" },
    usage: { prompt: 0, output: 0, total: 0 },
    latencyMs: 1,
});

describe("auditDrift", () => {
    it("produces one finding per origin with basis stamped", async () => {
        const call = vi.fn(async () => answer("drifted"));
        const resolve = vi.fn(async () => ({
            part: { text: "x" },
            basis: "fulltext" as const,
        }));
        const audit = makeAuditDrift(call as never, resolve as never);
        const { findings } = await audit(
            "claim",
            [node("W1"), node("W2")],
            emit,
        );
        expect(findings).toHaveLength(2);
        expect(findings[0]).toMatchObject({
            workId: "W1",
            label: "drifted",
            basis: "fulltext",
        });
    });

    it("uses abstract basis when full text is unavailable", async () => {
        const call = vi.fn(async () => answer("supported"));
        const resolve = vi.fn(async () => ({
            text: "abs",
            basis: "abstract" as const,
        }));
        const audit = makeAuditDrift(call as never, resolve as never);
        const { findings } = await audit("claim", [node("W1")], emit);
        expect(findings[0].basis).toBe("abstract");
    });

    it("skips an origin with no content and records a recovered error", async () => {
        const call = vi.fn(async () => answer("supported"));
        const resolve = vi.fn(async () => null);
        const audit = makeAuditDrift(call as never, resolve as never);
        const { findings, errors } = await audit(
            "claim",
            [node("W1", { oaUrl: null, abstract: null })],
            emit,
        );
        expect(findings).toHaveLength(0);
        expect(errors.some((e) => e.recovered)).toBe(true);
    });

    it("isolates a failing origin: others still produce findings", async () => {
        const call = vi
            .fn()
            .mockImplementationOnce(async () => {
                throw new Error("boom");
            })
            .mockImplementationOnce(async () => answer("supported"));
        const resolve = vi.fn(async () => ({
            text: "abs",
            basis: "abstract" as const,
        }));
        const audit = makeAuditDrift(call as never, resolve as never);
        const { findings, errors } = await audit(
            "claim",
            [node("W1"), node("W2")],
            emit,
        );
        expect(findings).toHaveLength(1);
        expect(errors.length).toBe(1);
    });

    it("streams each finding as a drift-finding delta", async () => {
        const deltas: DeltaEvent[] = [];
        const audit = makeAuditDrift(
            async () => ({
                data: {
                    label: "drifted",
                    evidenceQuote: "in mice only",
                    explanation: "generalized beyond the model organism",
                },
                usage: { prompt: 0, output: 0, total: 0 },
                latencyMs: 1,
            }),
            async () => ({ text: "abstract text", basis: "abstract" as const }),
        );
        const { findings } = await audit(
            "claim",
            [node("W9")],
            () => {},
            (e) => deltas.push(e),
        );
        const streamed = deltas.filter((d) => d.type === "drift-finding");
        expect(streamed.map((d) => d.finding)).toEqual(findings);
    });
});
