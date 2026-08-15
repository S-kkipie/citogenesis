import { describe, expect, it } from "vitest";
import { runSseEventSchema } from "../api";
import { deltaEventSchema } from "../delta";

const node = {
    id: "W1",
    title: "T",
    year: 2020,
    doi: null,
    type: "article",
    venue: null,
    authors: [],
    abstract: null,
    citedByCount: 0,
    isRetracted: false,
    oaUrl: null,
    depth: 0,
    source: "openalex",
    fetchStatus: "resolved",
};

describe("deltaEventSchema", () => {
    it("parses every delta variant", () => {
        const events = [
            { type: "claim-resolved", claim: "c", anchors: ["W1"] },
            {
                type: "graph-delta",
                nodes: [node],
                edges: [{ from: "W1", to: "W2" }],
            },
            {
                type: "nodes-patch",
                patches: [
                    {
                        id: "W1",
                        primacy: { label: "primary", method: "heuristic" },
                    },
                ],
            },
            { type: "origins", ids: ["W1"] },
            { type: "cycles", cycles: [["W1", "W2"]] },
            {
                type: "drift-finding",
                finding: {
                    workId: "W1",
                    label: "drifted",
                    evidenceQuote: null,
                    explanation: "e",
                    basis: "abstract",
                },
            },
        ];
        for (const e of events) {
            expect(deltaEventSchema.safeParse(e).success).toBe(true);
        }
    });

    it("rejects unknown types and malformed payloads", () => {
        expect(deltaEventSchema.safeParse({ type: "nope" }).success).toBe(
            false,
        );
        expect(
            deltaEventSchema.safeParse({ type: "origins", ids: ["notAnId"] })
                .success,
        ).toBe(false);
    });

    it("every delta variant is a valid RunSseEvent", () => {
        expect(
            runSseEventSchema.safeParse({
                type: "graph-delta",
                nodes: [],
                edges: [],
            }).success,
        ).toBe(true);
        expect(
            runSseEventSchema.safeParse({
                type: "claim-resolved",
                claim: "c",
                anchors: [],
            }).success,
        ).toBe(true);
    });
});
