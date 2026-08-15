import { z } from "zod";
import { runStateSchema, verdictSchema } from "./state";
import { isoInstant, traceEventSchema } from "./trace";

export const runStatusSchema = z.enum(["running", "done", "failed"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * SSE events streamed by POST /api/v1/runs. Eden exposes the stream as an
 * AsyncGenerator on the client.
 */
export const runSseEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("accepted"), runId: z.string() }),
    z.object({ type: z.literal("trace"), event: traceEventSchema }),
    z.object({
        type: z.literal("done"),
        runId: z.string(),
        verdict: verdictSchema,
    }),
    z.object({
        type: z.literal("failed"),
        runId: z.string(),
        message: z.string(),
    }),
]);
export type RunSseEvent = z.infer<typeof runSseEventSchema>;

/** Row shape returned by GET /api/v1/runs/:id. */
export const runRecordSchema = z.object({
    id: z.string(),
    createdAt: isoInstant,
    status: runStatusSchema,
    state: runStateSchema,
});
export type RunRecord = z.infer<typeof runRecordSchema>;
