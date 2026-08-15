import type { CitationNode, WorkId } from "../run/domain/graph";

export function unresolvedNode(id: WorkId, depth: number): CitationNode {
  return {
    id, title: "(unresolved)", year: null, doi: null, type: "unknown",
    venue: null, authors: [], abstract: null, citedByCount: 0,
    isRetracted: false, oaUrl: null, depth, source: "openalex",
    fetchStatus: "unresolved",
  };
}
