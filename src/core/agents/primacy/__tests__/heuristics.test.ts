import { describe, expect, it } from "vitest";
import { heuristicPrimacy } from "../heuristics";

describe("heuristicPrimacy", () => {
    it.each([
        "review",
        "editorial",
        "letter",
        "erratum",
        "paratext",
        "book-review",
        "book",
        "report",
    ])("%s → secondary", (t) => {
        expect(heuristicPrimacy(t)).toEqual({
            label: "secondary",
            method: "heuristic",
            rationale: expect.any(String),
        });
    });
    it("dataset → primary", () => {
        expect(heuristicPrimacy("dataset")?.label).toBe("primary");
    });
    it.each(["article", "preprint", "other", "", "something-new"])(
        "%s → null (LLM)",
        (t) => {
            expect(heuristicPrimacy(t)).toBeNull();
        },
    );
});
