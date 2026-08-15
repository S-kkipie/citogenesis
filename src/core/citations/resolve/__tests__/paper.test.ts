import { describe, expect, it, vi } from "vitest";
import type { FetchedWork } from "../../types";
import { resolvePaper } from "../paper";

const fw = (id: string): FetchedWork => ({
    node: {
        id,
        title: id,
        year: 2000,
        doi: null,
        type: "article",
        venue: null,
        authors: [],
        abstract: null,
        citedByCount: 0,
        isRetracted: false,
        oaUrl: null,
        depth: 0,
        source: "openalex",
        fetchStatus: "resolved",
    },
    referencedWorks: [],
    topicIds: [],
});

describe("resolvePaper", () => {
    it("returns an OpenAlex id unchanged", async () => {
        expect(await resolvePaper("W42", {})).toBe("W42");
    });

    it("resolves a DOI via OpenAlex", async () => {
        const getWorkByDoi = vi.fn().mockResolvedValue(fw("W7"));
        expect(await resolvePaper("10.1/abc", {}, { getWorkByDoi })).toBe("W7");
        expect(getWorkByDoi).toHaveBeenCalledWith("10.1/abc", {});
    });

    it("resolves arXiv via minted DOI", async () => {
        const getWorkByDoi = vi.fn().mockResolvedValue(fw("W8"));
        expect(
            await resolvePaper("arXiv:2101.00001", {}, { getWorkByDoi }),
        ).toBe("W8");
        expect(getWorkByDoi).toHaveBeenCalledWith(
            "10.48550/arXiv.2101.00001",
            {},
        );
    });

    it("falls back to S2 title search for unminted arXiv", async () => {
        const getWorkByDoi = vi.fn().mockResolvedValue(null);
        const s2GetPaper = vi.fn().mockResolvedValue({
            title: "Old Paper",
            year: 1990,
            doi: null,
            abstract: null,
        });
        const searchWorks = vi.fn().mockResolvedValue([fw("W9")]);
        expect(
            await resolvePaper(
                "arXiv:hep-th/9901001",
                {},
                { getWorkByDoi, s2GetPaper, searchWorks },
            ),
        ).toBe("W9");
        expect(searchWorks).toHaveBeenCalledWith("Old Paper", 1, {});
    });

    it("returns null when nothing resolves", async () => {
        expect(
            await resolvePaper(
                "not-an-id",
                {},
                {
                    getWorkByDoi: vi.fn().mockResolvedValue(null),
                },
            ),
        ).toBeNull();
    });

    it("returns null when dependency rejects", async () => {
        const getWorkByDoi = vi.fn().mockResolvedValue(null);
        const s2GetPaper = vi.fn().mockResolvedValue({
            title: "Old Paper",
            year: 1990,
            doi: null,
            abstract: null,
        });
        const searchWorks = vi.fn().mockRejectedValue(new Error("network"));
        await expect(
            resolvePaper(
                "arXiv:hep-th/9901001",
                {},
                {
                    getWorkByDoi,
                    s2GetPaper,
                    searchWorks,
                },
            ),
        ).resolves.toBeNull();
    });

    it("resolves raw numeric arXiv id via minted DOI", async () => {
        const getWorkByDoi = vi.fn().mockResolvedValue(fw("W10"));
        expect(await resolvePaper("2101.00001", {}, { getWorkByDoi })).toBe(
            "W10",
        );
        expect(getWorkByDoi).toHaveBeenCalledWith(
            "10.48550/arXiv.2101.00001",
            {},
        );
    });
});
