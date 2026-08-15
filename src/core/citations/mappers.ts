import type { CitationNode, WorkId } from "../run/domain/graph";
import type { FetchedWork } from "./types";

export interface OpenAlexRaw {
    id: string;
    title: string | null;
    display_name?: string | null;
    publication_year: number | null;
    doi: string | null;
    type: string | null;
    primary_location: { source?: { display_name?: string } | null } | null;
    authorships: Array<{ author: { display_name: string } }>;
    abstract_inverted_index: Record<string, number[]> | null;
    cited_by_count: number | null;
    is_retracted: boolean | null;
    best_oa_location: {
        pdf_url?: string | null;
        landing_page_url?: string | null;
    } | null;
    referenced_works: string[];
    topics: Array<{ id: string }>;
}

export function toWorkId(url: string): WorkId {
    const m = url.match(/[A-Za-z]+\d+$/);
    return (m ? m[0] : url) as WorkId;
}

export function reconstructAbstract(
    inv?: Record<string, number[]> | null,
): string | null {
    if (!inv) return null;
    const words: string[] = [];
    for (const [word, positions] of Object.entries(inv)) {
        for (const pos of positions) words[pos] = word;
    }
    const text = Array.from(words).join(" ").trim();
    return text.length ? text : null;
}

export function mapOpenAlexWork(raw: OpenAlexRaw): FetchedWork {
    const node: CitationNode = {
        id: toWorkId(raw.id),
        title: raw.title ?? raw.display_name ?? "(untitled)",
        year: raw.publication_year ?? null,
        doi: raw.doi ?? null,
        type: raw.type ?? "unknown",
        venue: raw.primary_location?.source?.display_name ?? null,
        authors: raw.authorships?.map((a) => a.author.display_name) ?? [],
        abstract: reconstructAbstract(raw.abstract_inverted_index),
        citedByCount: raw.cited_by_count ?? 0,
        isRetracted: raw.is_retracted ?? false,
        oaUrl:
            raw.best_oa_location?.pdf_url ??
            raw.best_oa_location?.landing_page_url ??
            null,
        depth: 0, // overwritten by the tracer
        source: "openalex",
        fetchStatus: "resolved",
    };
    return {
        node,
        referencedWorks: (raw.referenced_works ?? []).map(toWorkId),
        topicIds: (raw.topics ?? []).map((t) => toWorkId(t.id)),
    };
}
