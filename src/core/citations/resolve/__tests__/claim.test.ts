import { describe, expect, it, vi } from "vitest";
import type { FetchedWork } from "../../types";
import { resolveClaim } from "../claim";

const fw = (id: string, refs: string[], cited = 0): FetchedWork => ({
  node: {
    id, title: id, year: 2000, doi: null, type: "article", venue: null,
    authors: [], abstract: null, citedByCount: cited, isRetracted: false,
    oaUrl: null, depth: 0, source: "openalex", fetchStatus: "resolved",
  },
  referencedWorks: refs, topicIds: [],
});

describe("resolveClaim", () => {
  it("anchors on the first relevance hit that has references, and emits candidates", async () => {
    const emit = vi.fn();
    const searchWorks = vi.fn().mockResolvedValue([
      fw("W1", []),          // top relevance, no refs -> skip
      fw("W2", ["W9"]),      // first with refs -> pick
      fw("W3", ["W8"]),
    ]);
    const { anchors, errors } = await resolveClaim("gum myth", emit, {}, { searchWorks });
    expect(anchors).toEqual(["W2"]);
    expect(errors).toEqual([]);
    const progress = emit.mock.calls.find(([e]) => e.phase === "progress")?.[0];
    expect(progress.data.candidates).toHaveLength(3);
  });

  it("falls back to top-1 with a recovered error when none have refs", async () => {
    const searchWorks = vi.fn().mockResolvedValue([fw("W1", []), fw("W2", [])]);
    const { anchors, errors } = await resolveClaim("x", vi.fn(), {}, { searchWorks });
    expect(anchors).toEqual(["W1"]);
    expect(errors[0].recovered).toBe(true);
  });

  it("throws when the search is empty", async () => {
    const searchWorks = vi.fn().mockResolvedValue([]);
    await expect(resolveClaim("x", vi.fn(), {}, { searchWorks })).rejects.toThrow();
  });
});
