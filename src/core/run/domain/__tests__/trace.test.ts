import { describe, expect, it } from "vitest";
import { runSseEventSchema } from "../api";
import { traceEventSchema } from "../trace";

const event = {
    agent: "chain-tracer" as const,
    phase: "done" as const,
    summary: "traced 12 nodes",
};

describe("traceEventSchema.ts", () => {
    it("accepts an ISO string", () => {
        const r = traceEventSchema.safeParse({
            ...event,
            ts: "2026-08-15T14:44:02.300Z",
        });
        expect(r.success).toBe(true);
        expect(r.success && r.data.ts).toBe("2026-08-15T14:44:02.300Z");
    });

    // Eden's client revives ISO strings in JSON/SSE payloads into Date
    // objects. A string-only schema silently dropped every streamed trace
    // event on the client, leaving the live audit log empty.
    it("accepts a revived Date and normalizes it to an ISO string", () => {
        const r = traceEventSchema.safeParse({
            ...event,
            ts: new Date("2026-08-15T14:44:02.300Z"),
        });
        expect(r.success).toBe(true);
        expect(r.success && r.data.ts).toBe("2026-08-15T14:44:02.300Z");
    });

    it("parses a streamed trace SSE event carrying a revived Date", () => {
        const r = runSseEventSchema.safeParse({
            type: "trace",
            event: { ...event, ts: new Date("2026-08-15T14:44:02.300Z") },
        });
        expect(r.success).toBe(true);
    });

    it("still rejects a non-date ts", () => {
        expect(
            traceEventSchema.safeParse({ ...event, ts: "yesterday" }).success,
        ).toBe(false);
    });
});
