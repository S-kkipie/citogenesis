import { describe, expect, it } from "vitest";
import { BENCH_CASES } from "../fixtures/claims";

describe("benchmark fixtures", () => {
    it("defines exactly 3 cases, each with a claim and an origin", () => {
        expect(BENCH_CASES).toHaveLength(3);
        for (const c of BENCH_CASES) {
            expect(c.claim.length).toBeGreaterThan(0);
            expect(c.origin.id).toMatch(/^W\d+$/);
        }
    });
});
