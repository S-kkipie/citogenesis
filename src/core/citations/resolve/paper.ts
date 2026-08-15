import type { WorkId } from "../../run/domain/graph";
import { getWorkByDoi, searchWorks } from "../clients/openalex";
import { s2GetPaper } from "../clients/semanticscholar";
import type { OpenAlexOpts } from "../types";

export interface PaperDeps {
  getWorkByDoi: typeof getWorkByDoi;
  searchWorks: typeof searchWorks;
  s2GetPaper: typeof s2GetPaper;
}

const DEFAULTS: PaperDeps = { getWorkByDoi, searchWorks, s2GetPaper };

function extractDoi(id: string): string | null {
  const m = id.match(/10\.\d+\/\S+/);
  return m ? m[0].replace(/^https?:\/\/doi\.org\//i, "") : null;
}
function extractArxiv(id: string): string | null {
  const m = id.match(/^arxiv:\s*(.+)$/i) ?? id.match(/^(\d{4}\.\d{4,5})$/);
  return m ? m[1] : null;
}

export async function resolvePaper(
  id: string, opts: OpenAlexOpts, deps: Partial<PaperDeps> = {},
): Promise<WorkId | null> {
  const d = { ...DEFAULTS, ...deps };
  const trimmed = id.trim();

  if (/^W\d+$/.test(trimmed)) return trimmed as WorkId;

  const doi = extractDoi(trimmed);
  if (doi) {
    const fw = await d.getWorkByDoi(doi, opts);
    if (fw) return fw.node.id;
  }

  const arxiv = extractArxiv(trimmed);
  if (arxiv) {
    const minted = await d.getWorkByDoi(`10.48550/arXiv.${arxiv}`, opts);
    if (minted) return minted.node.id;
    const s2 = await d.s2GetPaper(`arXiv:${arxiv}`, { http: opts.http });
    if (s2?.title) {
      const hits = await d.searchWorks(s2.title, 1, opts);
      if (hits[0]) return hits[0].node.id;
    }
  }

  return null;
}
