import { describe, expect, it, vi } from "vitest";
import { s2GetPaper } from "../semanticscholar";

const res = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });

describe("s2GetPaper", () => {
    it("maps S2 fields", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            res({
                title: "T",
                year: 1999,
                abstract: "A",
                externalIds: { DOI: "10.1/x" },
            }),
        );
        const p = await s2GetPaper("arXiv:1234.5678", {
            http: { fetchImpl, baseDelayMs: 0 },
        });
        expect(p).toEqual({
            title: "T",
            year: 1999,
            doi: "10.1/x",
            abstract: "A",
        });
    });

    it("returns null on failure instead of throwing", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValue(new Response("no", { status: 404 }));
        expect(
            await s2GetPaper("DOI:bad", {
                http: { fetchImpl, baseDelayMs: 0 },
            }),
        ).toBeNull();
    });

    it("returns null for malformed external ID instead of throwing", async () => {
        const fetchImpl = vi.fn();
        await expect(
            s2GetPaper("\uD800", { http: { fetchImpl, baseDelayMs: 0 } }),
        ).resolves.toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
