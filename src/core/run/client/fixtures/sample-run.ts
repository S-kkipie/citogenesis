import type { RunRecord, RunState } from "@/core/run/domain";

export const node = (
    id: string,
    depth: number,
    over: Partial<RunState["graph"]["nodes"][number]> = {},
): RunState["graph"]["nodes"][number] => ({
    id,
    title: `Work ${id}`,
    year: 2015 + depth,
    doi: null,
    type: "article",
    venue: "Journal of Examples",
    authors: ["A. Author"],
    abstract: "Abstract text.",
    citedByCount: 10,
    isRetracted: false,
    oaUrl: "https://example.org/oa",
    depth,
    source: "openalex",
    fetchStatus: "resolved",
    primacy: { label: "secondary", method: "heuristic" },
    ...over,
});

export const sampleState: RunState = {
    input: { kind: "claim", text: "chocolate prevents cancer" },
    claim: "chocolate prevents cancer",
    anchors: ["W1"],
    graph: {
        nodes: [
            node("W1", 0, { title: "Anchor review", type: "review" }),
            node("W2", 1),
            node("W3", 1, { fetchStatus: "unresolved", primacy: undefined }),
            node("W4", 2, {
                title: "Origin preprint",
                type: "preprint",
                isRetracted: true,
                primacy: {
                    label: "primary",
                    method: "llm",
                    rationale: "reports original data",
                },
            }),
            node("W5", 2, {
                title: "Clean primary origin",
                primacy: { label: "primary", method: "heuristic" },
            }),
            node("W7", 2, {
                title: "Clean primary origin",
                type: "article",
                primacy: { label: "primary", method: "heuristic" },
            }),
            node("W6", 2, { title: "Cycle member" }),
            node("W8", 2, { title: "Drifted secondary" }),
        ],
        edges: [
            { from: "W1", to: "W2" },
            { from: "W1", to: "W3" },
            { from: "W2", to: "W4" },
            { from: "W2", to: "W5" },
            { from: "W2", to: "W7" },
            { from: "W2", to: "W8" },
            { from: "W2", to: "W6" },
            { from: "W6", to: "W2" }, // closes the cycle W2->W6->W2
        ],
        truncated: true,
    },
    cycles: [["W2", "W6"]],
    originCandidates: ["W4", "W5", "W7"],
    driftFindings: [
        {
            workId: "W4",
            label: "contradicted",
            basis: "abstract",
            evidenceQuote: "in mice, at high doses, tumor growth was unchanged",
            explanation:
                "Origin found no effect; claim asserts prevention in humans.",
        },
        {
            workId: "W5",
            label: "partially-supported",
            basis: "fulltext",
            evidenceQuote: "a modest association was observed",
            explanation: "Caveats dropped downstream.",
        },
        {
            workId: "W8",
            label: "drifted",
            basis: "fulltext",
            evidenceQuote: "results were preliminary",
            explanation: "Scope inflated downstream.",
        },
    ],
    verdict: {
        confidence: "LOW",
        score: 22,
        pathogens: [
            "circular-support",
            "single-point-of-failure",
            "claim-drift",
        ],
        primaryRatio: 0.4,
        coverage: {
            resolved: 5,
            total: 6,
        },
        prose: "The claim funnels to a single retracted preprint and drifts from its origin.",
    },
    trace: [
        {
            ts: "2026-08-15T12:00:00.000Z",
            agent: "input-adapter",
            phase: "done",
            summary: "Anchored claim to W1",
        },
        {
            ts: "2026-08-15T12:00:01.000Z",
            agent: "chain-tracer",
            phase: "progress",
            summary: "Expanded W1 → 2 refs",
        },
        {
            ts: "2026-08-15T12:00:02.000Z",
            agent: "chain-tracer",
            phase: "done",
            summary: "6 nodes, cycle W2↔W6",
        },
        {
            ts: "2026-08-15T12:00:03.000Z",
            agent: "primacy-judge",
            phase: "done",
            summary: "2 primary, 3 secondary, 1 unknown",
        },
        {
            ts: "2026-08-15T12:00:04.000Z",
            agent: "drift-auditor",
            phase: "recovery",
            summary: "No full text for W4 → abstract fallback",
        },
        {
            ts: "2026-08-15T12:00:05.000Z",
            agent: "drift-auditor",
            phase: "done",
            summary: "W4 contradicted, W5 partial",
        },
        {
            ts: "2026-08-15T12:00:06.000Z",
            agent: "verdict",
            phase: "done",
            summary: "Confidence LOW (22)",
        },
    ],
    errors: [
        {
            agent: "drift-auditor",
            message: "OA full text unavailable for W4",
            recovered: true,
        },
    ],
};

export const sampleRecord: RunRecord = {
    id: "sample-run",
    createdAt: "2026-08-15T12:00:06.000Z",
    status: "done",
    state: sampleState,
};
