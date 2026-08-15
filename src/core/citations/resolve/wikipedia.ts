import { load } from "cheerio";
import type { WorkId } from "../../run/domain/graph";
import type { RunError } from "../../run/domain/state";
import type { TraceEmit } from "../../run/domain/trace";
import { getWorkByDoi, getWorkByPmid, searchWorks } from "../clients/openalex";
import type { HttpOpts } from "../clients/http";
import type { OpenAlexOpts } from "../types";

const MAX_PAGE_REFS = 20;

export interface WikiIdentifier {
  kind: "doi" | "pmid" | "url" | "title";
  value: string;
  raw: string;
}

export function parseWikiUrl(url: string): { lang: string; title: string } {
  const u = new URL(url);
  const lang = u.hostname.split(".")[0];
  const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
  return { lang, title };
}

export async function fetchWikipediaHtml(
  url: string, opts: { http?: HttpOpts } = {},
): Promise<string> {
  const { lang, title } = parseWikiUrl(url);
  const api = `https://${lang}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`;
  const fetchImpl = opts.http?.fetchImpl ?? fetch;
  const res = await fetchImpl(api);
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
  return res.text();
}

export function extractAnchorsFromHtml(
  html: string, statement?: string,
): WikiIdentifier[] {
  const $ = load(html);

  const noteIds: string[] = [];
  if (statement) {
    let scope: ReturnType<typeof $> | null = null;
    $("p, li").each((_, el) => {
      if ($(el).text().includes(statement)) {
        scope = $(el);
        return false;
      }
    });
    (scope ?? $("body"))
      .find('sup a[href^="#cite_note"]')
      .each((_, a) => {
        noteIds.push(($(a).attr("href") ?? "").replace(/^#/, ""));
      });
  } else {
    $("ol.references > li").each((_, li) => {
      const id = $(li).attr("id");
      if (id && noteIds.length < MAX_PAGE_REFS) noteIds.push(id);
    });
  }

  const out: WikiIdentifier[] = [];
  for (const noteId of noteIds) {
    const li = $(`[id="${noteId}"]`);
    if (li.length === 0) continue;

    const doi = li.find('a[href*="doi.org"]').attr("href");
    if (doi) {
      out.push({ kind: "doi", value: doi.replace(/^https?:\/\/doi\.org\//i, ""), raw: doi });
      continue;
    }
    const pmidHref = li.find('a[href*="/pubmed/"], a[href*="ncbi.nlm.nih.gov"]').attr("href");
    const pmid = pmidHref?.match(/(\d+)\/?$/)?.[1];
    if (pmid) {
      out.push({ kind: "pmid", value: pmid, raw: pmidHref! });
      continue;
    }
    const ext = li.find('a[rel~="mw:ExtLink"], a.external').attr("href");
    if (ext) {
      out.push({ kind: "url", value: ext, raw: ext });
      continue;
    }
    const title = li.find("cite, .citation").first().text().trim();
    if (title) out.push({ kind: "title", value: title, raw: title });
  }
  return out;
}

export interface WikiDeps {
  fetchHtml: typeof fetchWikipediaHtml;
  getWorkByDoi: typeof getWorkByDoi;
  getWorkByPmid: typeof getWorkByPmid;
  searchWorks: typeof searchWorks;
}
const DEFAULTS: WikiDeps = {
  fetchHtml: fetchWikipediaHtml, getWorkByDoi, getWorkByPmid, searchWorks,
};

async function resolveIdentifier(
  idf: WikiIdentifier, opts: OpenAlexOpts, d: WikiDeps,
): Promise<WorkId | null> {
  if (idf.kind === "doi") return (await d.getWorkByDoi(idf.value, opts))?.node.id ?? null;
  if (idf.kind === "pmid") return (await d.getWorkByPmid(idf.value, opts))?.node.id ?? null;
  const hits = await d.searchWorks(idf.value, 1, opts);
  return hits[0]?.node.id ?? null;
}

export async function resolveWikipedia(
  url: string, statement: string | undefined, emit: TraceEmit,
  opts: OpenAlexOpts, deps: Partial<WikiDeps> = {},
): Promise<{ claim: string; anchors: WorkId[]; errors: RunError[] }> {
  const d = { ...DEFAULTS, ...deps };
  const html = await d.fetchHtml(url, { http: opts.http });
  const identifiers = extractAnchorsFromHtml(html, statement);
  emit({
    agent: "input-adapter", phase: "progress",
    summary: `${identifiers.length} Wikipedia reference(s) extracted`,
    data: { count: identifiers.length, targeted: Boolean(statement) },
  });

  const anchors: WorkId[] = [];
  const errors: RunError[] = [];
  for (const idf of identifiers) {
    const workId = await resolveIdentifier(idf, opts, d);
    if (workId) anchors.push(workId);
    else errors.push({
      agent: "input-adapter", recovered: true,
      message: `Unresolved Wikipedia reference: ${idf.raw}`,
    });
  }

  const unique = [...new Set(anchors)];
  if (unique.length === 0) throw new Error(`No resolvable references found on ${url}`);

  const { title } = parseWikiUrl(url);
  return { claim: statement ?? title.replace(/_/g, " "), anchors: unique, errors };
}
