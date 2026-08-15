import { describe, expect, it, vi } from "vitest";
import type { CitationNode } from "@/core/run/domain";

process.env.GEMINI_API_KEY ??= "test-gemini-api-key";
process.env.OPENALEX_MAILTO ??= "test@example.com";

const { resolveOriginContent } = await import("../fetch-text");

const node = (over: Partial<CitationNode> = {}): CitationNode => ({
    id: "W1",
    title: "t",
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: "an abstract",
    citedByCount: 0,
    isRetracted: false,
    oaUrl: "http://x/y.pdf",
    depth: 1,
    source: "openalex",
    fetchStatus: "resolved",
    ...over,
});

describe("resolveOriginContent", () => {
    it("returns a fulltext part when the PDF uploads", async () => {
        const upload = vi.fn(async () => ({
            fileData: { fileUri: "files/x" },
        }));
        const r = await resolveOriginContent(node(), upload as never);
        expect(r).toEqual({
            part: { fileData: { fileUri: "files/x" } },
            basis: "fulltext",
        });
    });

    it("falls back to abstract when the PDF is unavailable", async () => {
        const upload = vi.fn(async () => null);
        const r = await resolveOriginContent(node(), upload as never);
        expect(r).toEqual({ text: "an abstract", basis: "abstract" });
    });

    it("returns null when neither PDF nor abstract exists", async () => {
        const upload = vi.fn(async () => null);
        const r = await resolveOriginContent(
            node({ oaUrl: null, abstract: null }),
            upload as never,
        );
        expect(r).toBeNull();
    });
});
