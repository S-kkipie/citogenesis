import { describe, expect, it, vi } from "vitest";
import { TRACE_BUDGET, type WorkId } from "../../../run/domain/graph";
import type { FetchedWork } from "../../types";
import { traceChainWith } from "../bfs";

// A tiny fake graph: W1 -> [W2, W3]; W2 -> [W1] (cycle back to anchor).
const fw = (id: string, refs: string[], topics: string[] = ["T1"]): FetchedWork => ({
  node: {
    id, title: id, year: 2000, doi: null, type: "article", venue: null,
    authors: [], abstract: null, citedByCount: 0, isRetracted: false,
    oaUrl: null, depth: 0, source: "openalex", fetchStatus: "resolved",
  },
  referencedWorks: refs as WorkId[],
  topicIds: topics,
});

const DB: Record<string, FetchedWork> = {
  W1: fw("W1", ["W2", "W3"]),
  W2: fw("W2", ["W1"]),
  W3: fw("W3", []),
};

const fetchWorks = async (ids: WorkId[]) => {
  const works = new Map<WorkId, FetchedWork>();
  const missing: WorkId[] = [];
  for (const id of ids) (DB[id] ? works.set(id, DB[id]) : missing.push(id));
  return { works, missing };
};

describe("traceChainWith", () => {
  it("builds the backwards graph and detects the cycle", async () => {
    const emit = vi.fn();
    const { graph, cycles, errors } = await traceChainWith(["W1"], TRACE_BUDGET, emit, fetchWorks);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["W1", "W2", "W3"]);
    expect(graph.edges).toContainEqual({ from: "W1", to: "W2" });
    expect(cycles.some((c) => c.includes("W1") && c.includes("W2"))).toBe(true);
    expect(errors).toEqual([]);
  });

  it("keeps an unresolved node (placeholder) and reports a recovered error", async () => {
    const emit = vi.fn();
    const anchor = fw("W1", ["Wmissing"]);
    const only = async (ids: WorkId[]) => {
      const works = new Map<WorkId, FetchedWork>();
      const missing: WorkId[] = [];
      for (const id of ids) (id === "W1" ? works.set(id, anchor) : missing.push(id));
      return { works, missing };
    };
    const { graph, errors } = await traceChainWith(["W1"], TRACE_BUDGET, emit, only);
    const un = graph.nodes.find((n) => n.id === "Wmissing")!;
    expect(un.fetchStatus).toBe("unresolved");
    expect(un.title).toBe("(unresolved)");
    expect(errors.some((e) => e.recovered && e.agent === "chain-tracer")).toBe(true);
  });

  it("respects maxRefsPerNode and sets truncated", async () => {
    const many = fw("W1", Array.from({ length: 40 }, (_, i) => `Wr${i}`));
    const db: Record<string, FetchedWork> = { W1: many };
    for (let i = 0; i < 40; i++) db[`Wr${i}`] = fw(`Wr${i}`, [], ["T1"]);
    const f = async (ids: WorkId[]) => {
      const works = new Map<WorkId, FetchedWork>();
      for (const id of ids) if (db[id]) works.set(id, db[id]);
      return { works, missing: ids.filter((i) => !db[i]) };
    };
    const { graph } = await traceChainWith(["W1"], TRACE_BUDGET, vi.fn(), f);
    // 1 anchor + 25 kept refs
    expect(graph.nodes).toHaveLength(26);
    expect(graph.truncated).toBe(true);
  });
});
