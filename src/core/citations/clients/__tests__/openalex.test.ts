import { describe, expect, it, vi } from "vitest";
import { getWorks, searchWorks } from "../openalex";

const res = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const work = (id: string, refs: string[] = []) => ({
  id: `https://openalex.org/${id}`, title: id, publication_year: 2000, doi: null,
  type: "article", primary_location: null, authorships: [], abstract_inverted_index: null,
  cited_by_count: 0, is_retracted: false, best_oa_location: null,
  referenced_works: refs, topics: [],
});

describe("searchWorks", () => {
  it("returns mapped works", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({ results: [work("W1", ["W9"])] }));
    const out = await searchWorks("gum", 10, { http: { fetchImpl } });
    expect(out[0].node.id).toBe("W1");
    expect(out[0].referencedWorks).toEqual(["W9"]);
  });
});

describe("getWorks", () => {
  it("maps results and reports missing ids", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res({ results: [work("W1"), work("W2")] }));
    const { works, missing } = await getWorks(["W1", "W2", "W3"], { http: { fetchImpl } });
    expect([...works.keys()].sort()).toEqual(["W1", "W2"]);
    expect(missing).toEqual(["W3"]);
  });

  it("chunks ids at 50 per request", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `W${i + 1}`);
    const fetchImpl = vi.fn().mockResolvedValue(res({ results: [] }));
    await getWorks(ids, { http: { fetchImpl } });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 50 + 50 + 20
  });
});
