import { describe, expect, it } from "vitest";
import { inputKey } from "../input-key";

describe("inputKey", () => {
    it("normalizes claim case and whitespace", () => {
        const a = inputKey({ kind: "claim", text: "Vaccines cause autism" });
        const b = inputKey({
            kind: "claim",
            text: "  vaccines CAUSE Autism  ",
        });
        expect(a).toBe(b);
    });

    it("normalizes paper id case and whitespace", () => {
        const a = inputKey({ kind: "paper", id: "W2741809807" });
        const b = inputKey({ kind: "paper", id: "  w2741809807  " });
        expect(a).toBe(b);
    });

    it("never collides across kinds even with identical text", () => {
        const claim = inputKey({ kind: "claim", text: "x" });
        const paper = inputKey({ kind: "paper", id: "x" });
        expect(claim).not.toBe(paper);
    });

    it("distinguishes wikipedia input with and without a statement", () => {
        const withoutStatement = inputKey({
            kind: "wikipedia",
            url: "https://en.wikipedia.org/wiki/Vaccine",
        });
        const withStatement = inputKey({
            kind: "wikipedia",
            url: "https://en.wikipedia.org/wiki/Vaccine",
            statement: "Vaccines are safe and effective.",
        });
        expect(withoutStatement).not.toBe(withStatement);
    });

    it("preserves wikipedia URL path case (article titles are case-sensitive)", () => {
        const upper = inputKey({
            kind: "wikipedia",
            url: "https://en.wikipedia.org/wiki/COVID-19",
        });
        const lower = inputKey({
            kind: "wikipedia",
            url: "https://en.wikipedia.org/wiki/covid-19",
        });
        expect(upper).not.toBe(lower);
    });

    it("normalizes wikipedia statement case and whitespace while keeping URL case", () => {
        const a = inputKey({
            kind: "wikipedia",
            url: "https://en.wikipedia.org/wiki/Vaccine",
            statement: "Vaccines are safe.",
        });
        const b = inputKey({
            kind: "wikipedia",
            url: "https://en.wikipedia.org/wiki/Vaccine",
            statement: "  VACCINES are Safe.  ",
        });
        expect(a).toBe(b);
    });
});
