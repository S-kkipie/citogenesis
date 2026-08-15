import { describe, expect, it, vi } from "vitest";
import { WIKI_HTML } from "../../fixtures/wikipedia-parsoid.html";
import type { FetchedWork } from "../../types";
import {
    extractAnchorsFromHtml,
    parseWikiUrl,
    resolveWikipedia,
} from "../wikipedia";

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

describe("parseWikiUrl", () => {
    it("splits lang and title", () => {
        expect(
            parseWikiUrl("https://en.wikipedia.org/wiki/Citogenesis"),
        ).toEqual({ lang: "en", title: "Citogenesis" });
    });
});

describe("extractAnchorsFromHtml", () => {
    it("targets only the statement's [n] reference", () => {
        const out = extractAnchorsFromHtml(
            WIKI_HTML,
            "stays in your stomach for seven years",
        );
        expect(out).toEqual([
            {
                kind: "doi",
                value: "10.1000/gum",
                raw: "https://doi.org/10.1000/gum",
            },
        ]);
    });

    it("falls back to all references with no statement", () => {
        const out = extractAnchorsFromHtml(WIKI_HTML);
        expect(out.map((o) => o.kind)).toEqual(["doi", "url"]);
    });

    it("degrades gracefully (capped) when the statement matches nothing", () => {
        const out = extractAnchorsFromHtml(
            WIKI_HTML,
            "totally-absent-statement",
        );
        expect(out.map((o) => o.kind)).toEqual(["doi", "url"]);
    });
});

describe("resolveWikipedia", () => {
    it("resolves the statement's DOI to an anchor", async () => {
        const deps = {
            fetchHtml: vi.fn().mockResolvedValue(WIKI_HTML),
            getWorkByDoi: vi.fn().mockResolvedValue(fw("W100")),
        };
        const { anchors, claim } = await resolveWikipedia(
            "https://en.wikipedia.org/wiki/Gum",
            "stays in your stomach for seven years",
            vi.fn(),
            {},
            deps,
        );
        expect(anchors).toEqual(["W100"]);
        expect(claim).toBe("stays in your stomach for seven years");
    });

    it("throws when nothing resolves", async () => {
        const deps = {
            fetchHtml: vi.fn().mockResolvedValue(WIKI_HTML),
            getWorkByDoi: vi.fn().mockResolvedValue(null),
        };
        await expect(
            resolveWikipedia(
                "https://en.wikipedia.org/wiki/Gum",
                "seven years",
                vi.fn(),
                {},
                deps,
            ),
        ).rejects.toThrow();
    });

    it("recovers when one identifier's resolution rejects, keeping already-resolved anchors", async () => {
        const deps = {
            fetchHtml: vi.fn().mockResolvedValue(WIKI_HTML),
            getWorkByDoi: vi.fn().mockResolvedValue(fw("W100")),
            searchWorks: vi.fn().mockRejectedValue(new Error("network")),
        };
        const { anchors, errors } = await resolveWikipedia(
            "https://en.wikipedia.org/wiki/Gum",
            undefined,
            vi.fn(),
            {},
            deps,
        );
        expect(anchors).toEqual(["W100"]);
        expect(errors).toHaveLength(1);
    });
});
