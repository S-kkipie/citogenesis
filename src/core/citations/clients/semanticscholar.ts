import { getJson, type HttpOpts } from "./http";

const BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,year,externalIds,abstract";

export interface S2Paper {
    title: string | null;
    year: number | null;
    doi: string | null;
    abstract: string | null;
}

let queue: Promise<unknown> = Promise.resolve();
const throttle = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(() => fn());
    queue = run.then(
        () => new Promise((r) => setTimeout(r, 1000)),
        () => undefined,
    );
    return run;
};

interface S2Raw {
    title: string | null;
    year: number | null;
    abstract: string | null;
    externalIds?: { DOI?: string } | null;
}

export function s2GetPaper(
    externalId: string,
    opts: { http?: HttpOpts } = {},
): Promise<S2Paper | null> {
    return throttle(async () => {
        try {
            const url = `${BASE}/paper/${encodeURIComponent(externalId)}?fields=${FIELDS}`;
            const j = await getJson<S2Raw>(url, opts.http);
            return {
                title: j.title ?? null,
                year: j.year ?? null,
                doi: j.externalIds?.DOI ?? null,
                abstract: j.abstract ?? null,
            };
        } catch {
            return null;
        }
    });
}
