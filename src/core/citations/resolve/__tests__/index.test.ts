import { describe, expect, it, vi } from "vitest";
import type { RunInput } from "../../../run/domain/state";
import { resolveInputWith } from "../index";

describe("resolveInputWith", () => {
  it("dispatches a claim input", async () => {
    const resolveClaim = vi.fn().mockResolvedValue({ anchors: ["W1"], errors: [] });
    const out = await resolveInputWith(
      { kind: "claim", text: "some claim here" } as RunInput, vi.fn(), {},
      { resolveClaim },
    );
    expect(out.anchors).toEqual(["W1"]);
    expect(out.claim).toBe("some claim here");
  });

  it("dispatches a paper input and titles the claim from the work", async () => {
    const resolvePaper = vi.fn().mockResolvedValue("W5");
    const getWorks = vi.fn().mockResolvedValue({
      works: new Map([["W5", { node: { id: "W5", title: "Paper Five" }, referencedWorks: [], topicIds: [] }]]),
      missing: [],
    });
    const out = await resolveInputWith(
      { kind: "paper", id: "W5" } as RunInput, vi.fn(), {}, { resolvePaper, getWorks },
    );
    expect(out.anchors).toEqual(["W5"]);
    expect(out.claim).toBe("Paper Five");
  });

  it("throws when a paper cannot be resolved", async () => {
    const resolvePaper = vi.fn().mockResolvedValue(null);
    await expect(resolveInputWith(
      { kind: "paper", id: "bad" } as RunInput, vi.fn(), {}, { resolvePaper },
    )).rejects.toThrow();
  });
});
