import { describe, expect, it } from "vitest";
import { prioritizeRefs, type RefCandidate } from "../prioritize";

const c = (id: string, topics: string[], year: number | null): RefCandidate =>
  ({ id, topicIds: topics, year });

describe("prioritizeRefs", () => {
  const claim = new Set(["T1", "T2"]);

  it("ranks higher topic overlap first, older year as tiebreak", () => {
    const kept = prioritizeRefs(
      [
        c("W_lowOverlapNew", ["T1"], 2020),
        c("W_highOverlapNew", ["T1", "T2"], 2019),
        c("W_highOverlapOld", ["T1", "T2"], 1990),
        c("W_noOverlap", ["T9"], 1980),
      ],
      claim,
      3,
    );
    expect(kept.map((k) => k.id)).toEqual([
      "W_highOverlapOld", // overlap 2, oldest
      "W_highOverlapNew", // overlap 2, newer
      "W_lowOverlapNew", // overlap 1
    ]);
  });

  it("puts unresolved candidates (no topics, null year) last", () => {
    const kept = prioritizeRefs(
      [c("W_unresolved", [], null), c("W_resolved", ["T1"], 2000)],
      claim,
      2,
    );
    expect(kept[0].id).toBe("W_resolved");
    expect(kept[1].id).toBe("W_unresolved");
  });
});
