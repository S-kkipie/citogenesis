import { describe, expect, it } from "vitest";
import type { CitationGraph } from "../../../run/domain/graph";
import { findCycles } from "../cycles";

const g = (ids: string[], edges: [string, string][]): CitationGraph => ({
  nodes: ids.map((id) => ({
    id, title: id, year: null, doi: null, type: "article", venue: null,
    authors: [], abstract: null, citedByCount: 0, isRetracted: false,
    oaUrl: null, depth: 0, source: "openalex", fetchStatus: "resolved",
  })),
  edges: edges.map(([from, to]) => ({ from, to })),
  truncated: false,
});

describe("findCycles", () => {
  it("finds an A->B->C->A cycle", () => {
    const cycles = findCycles(g(["A", "B", "C"], [["A", "B"], ["B", "C"], ["C", "A"]]));
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(["A", "B", "C"]);
  });

  it("returns no cycles for a DAG", () => {
    expect(findCycles(g(["A", "B", "C"], [["A", "B"], ["A", "C"]]))).toEqual([]);
  });
});
