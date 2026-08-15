import type { CitationNode } from "@/core/run/domain";

export interface BenchCase {
    claim: string;
    origin: CitationNode;
}

const origin = (over: Partial<CitationNode>): CitationNode => ({
    id: "W0",
    title: "",
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: null,
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth: 2,
    source: "openalex",
    fetchStatus: "resolved",
    ...over,
});

// PLACEHOLDER FIXTURES — not real papers. These are filled in during demo prep
// (spec §6) with 3 real OA-backed cases whose drift verdict can be judged by
// hand: one clear over-generalization, one faithful citation, one dropped
// caveat. Swap `claim`, `origin.title`, and `origin.oaUrl` for the real
// picks before running `bench.ts` for the model decision.
export const BENCH_CASES: BenchCase[] = [
    {
        claim: "PLACEHOLDER CLAIM 1 (a known over-generalization) — fill in during demo prep.",
        origin: origin({
            id: "W2001",
            title: "PLACEHOLDER ORIGIN 1",
            oaUrl: "https://example.org/placeholder/origin-1.pdf",
        }),
    },
    {
        claim: "PLACEHOLDER CLAIM 2 (a faithful citation) — fill in during demo prep.",
        origin: origin({
            id: "W2002",
            title: "PLACEHOLDER ORIGIN 2",
            oaUrl: "https://example.org/placeholder/origin-2.pdf",
        }),
    },
    {
        claim: "PLACEHOLDER CLAIM 3 (a dropped caveat) — fill in during demo prep.",
        origin: origin({
            id: "W2003",
            title: "PLACEHOLDER ORIGIN 3",
            oaUrl: "https://example.org/placeholder/origin-3.pdf",
        }),
    },
];
