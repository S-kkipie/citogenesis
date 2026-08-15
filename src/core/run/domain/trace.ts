import { z } from "zod";

/** ISO-8601 instant that tolerates a revived `Date` and normalizes to string. */
export const isoInstant = z
    .union([z.iso.datetime(), z.date()])
    .transform((v) => (typeof v === "string" ? v : v.toISOString()));

export const agentNameSchema = z.enum([
    "input-adapter",
    "chain-tracer",
    "primacy-judge",
    "drift-auditor",
    "verdict",
]);
export type AgentName = z.infer<typeof agentNameSchema>;

/**
 * One entry in the auditable run trace. Every agent handoff and every
 * recovery lands here — the trace IS the "auditable result" deliverable.
 */
export const traceEventSchema = z.object({
    /**
     * ISO-8601 instant. Accepts a `Date` on input because Eden's client
     * revives ISO strings in JSON/SSE payloads into `Date` objects — a
     * string-only schema silently rejects every streamed trace event on the
     * client. Output is always the normalized string.
     */
    ts: isoInstant,
    agent: agentNameSchema,
    phase: z.enum([
        "start",
        "progress",
        "handoff",
        "recovery",
        "error",
        "done",
    ]),
    /** Human-readable one-liner, shown in the UI audit log. */
    summary: z.string(),
    /** Optional structured payload (counts, ids, labels). Keep it small. */
    data: z.unknown().optional(),
});
export type TraceEvent = z.infer<typeof traceEventSchema>;

/** Agents emit trace events without ts; the runtime stamps them. */
export type TraceEmit = (event: Omit<TraceEvent, "ts">) => void;
