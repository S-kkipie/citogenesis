import type { WorkId } from "../../run/domain/graph";
import { mapOpenAlexWork, type OpenAlexRaw } from "../mappers";
import type { FetchedWork, OpenAlexOpts } from "../types";
import type { FetchLike, HttpOpts } from "./http";
import { getJson } from "./http";

const BASE = "https://api.openalex.org";
const MAX_IDS_PER_FILTER = 50;
const SELECT = [
    "id",
    "title",
    "display_name",
    "publication_year",
    "doi",
    "type",
    "primary_location",
    "authorships",
    "abstract_inverted_index",
    "cited_by_count",
    "is_retracted",
    "best_oa_location",
    "referenced_works",
    "topics",
].join(",");

const mailtoParam = (opts: OpenAlexOpts) =>
    opts.mailto ? `&mailto=${encodeURIComponent(opts.mailto)}` : "";

const withCloneableBodies = (http?: HttpOpts): HttpOpts | undefined => {
    if (!http?.fetchImpl) return http;
    const cloneFetch: FetchLike = async (input, init) => {
        // biome-ignore lint/style/noNonNullAssertion: The guard above guarantees the injected fetch implementation exists.
        const response = await http.fetchImpl!(input, init);
        return response.clone();
    };
    return { ...http, fetchImpl: cloneFetch };
};

function chunk<T>(xs: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
    return out;
}

export async function searchWorks(
    query: string,
    perPage: number,
    opts: OpenAlexOpts = {},
): Promise<FetchedWork[]> {
    const url = `${BASE}/works?search=${encodeURIComponent(query)}&per_page=${perPage}&select=${SELECT}${mailtoParam(opts)}`;
    const page = await getJson<{ results: OpenAlexRaw[] }>(
        url,
        withCloneableBodies(opts.http),
    );
    return page.results.map(mapOpenAlexWork);
}

export async function getWorks(
    ids: WorkId[],
    opts: OpenAlexOpts = {},
): Promise<{ works: Map<WorkId, FetchedWork>; missing: WorkId[] }> {
    const works = new Map<WorkId, FetchedWork>();
    for (const group of chunk(ids, MAX_IDS_PER_FILTER)) {
        const filter = `openalex:${group.join("|")}`;
        const url = `${BASE}/works?filter=${encodeURIComponent(filter)}&per_page=${group.length}&select=${SELECT}${mailtoParam(opts)}`;
        const page = await getJson<{ results: OpenAlexRaw[] }>(
            url,
            withCloneableBodies(opts.http),
        );
        for (const raw of page.results) {
            const fw = mapOpenAlexWork(raw);
            works.set(fw.node.id, fw);
        }
    }
    const missing = ids.filter((id) => !works.has(id));
    return { works, missing };
}

async function getWorkByPath(
    path: string,
    opts: OpenAlexOpts,
): Promise<FetchedWork | null> {
    const url = `${BASE}/works/${path}?select=${SELECT}${mailtoParam(opts)}`;
    try {
        return mapOpenAlexWork(
            await getJson<OpenAlexRaw>(url, withCloneableBodies(opts.http)),
        );
    } catch {
        return null;
    }
}

export function getWorkByDoi(doi: string, opts: OpenAlexOpts = {}) {
    const clean = doi.replace(/^https?:\/\/doi\.org\//i, "");
    return getWorkByPath(`doi:${encodeURIComponent(clean)}`, opts);
}

export function getWorkByPmid(pmid: string, opts: OpenAlexOpts = {}) {
    return getWorkByPath(`pmid:${encodeURIComponent(pmid)}`, opts);
}
