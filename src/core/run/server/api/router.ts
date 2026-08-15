import { eq } from "drizzle-orm";
import { Elysia, sse } from "elysia";
import { nanoid } from "nanoid";
import type { RunSseEvent, RunState } from "@/core/run/domain";
import { runInputSchema } from "@/core/run/domain";
import { db } from "@/server/drizzle/db";
import { runs } from "@/server/drizzle/schemas";
import { buildRunGraph, type LiveChunk } from "../graph";

const emptyState = (input: RunState["input"]): RunState => ({
    input,
    claim: "",
    anchors: [],
    graph: { nodes: [], edges: [], truncated: false },
    cycles: [],
    originCandidates: [],
    driftFindings: [],
    verdict: null,
    trace: [],
    errors: [],
});

const event = (e: RunSseEvent) => sse({ event: e.type, data: e });

export const runsRouter = new Elysia({ prefix: "/runs" })
    .post(
        "/",
        async function* ({ body }) {
            const runId = nanoid();
            await db.insert(runs).values({
                id: runId,
                status: "running",
                state: emptyState(body),
            });
            yield event({ type: "accepted", runId });

            try {
                const graph = buildRunGraph();
                let finalState: RunState | undefined;

                const stream = await graph.stream(
                    { input: body },
                    { streamMode: ["values", "custom"] },
                );
                for await (const chunk of stream as AsyncIterable<
                    [string, unknown]
                >) {
                    const [mode, payload] = chunk;
                    if (mode === "custom") {
                        const live = payload as LiveChunk;
                        yield event(
                            live.kind === "trace"
                                ? { type: "trace", event: live.event }
                                : live.event,
                        );
                    } else if (mode === "values") {
                        finalState = payload as RunState;
                    }
                }

                if (!finalState?.verdict) {
                    throw new Error("run finished without a verdict");
                }
                await db
                    .update(runs)
                    .set({ status: "done", state: finalState })
                    .where(eq(runs.id, runId));
                yield event({
                    type: "done",
                    runId,
                    verdict: finalState.verdict,
                });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                await db
                    .update(runs)
                    .set({ status: "failed" })
                    .where(eq(runs.id, runId));
                yield event({ type: "failed", runId, message });
            }
        },
        { body: runInputSchema },
    )
    .get("/:id", async ({ params, status }) => {
        const [row] = await db
            .select()
            .from(runs)
            .where(eq(runs.id, params.id))
            .limit(1);
        if (!row) return status(404, { code: "NOT_FOUND", status: 404 });
        return row;
    });
