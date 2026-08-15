import { and, desc, eq } from "drizzle-orm";
import { Elysia, sse } from "elysia";
import { nanoid } from "nanoid";
import type { RunSseEvent, RunState } from "@/core/run/domain";
import { inputKey, runInputSchema } from "@/core/run/domain";
import { db } from "@/server/drizzle/db";
import { runs } from "@/server/drizzle/schemas";
import { buildRunGraph, type LiveChunk } from "../graph";
import { listRuns } from "../list-runs";

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
            const key = inputKey(body);
            const [existing] = await db
                .select({ id: runs.id, state: runs.state })
                .from(runs)
                .where(and(eq(runs.inputKey, key), eq(runs.status, "done")))
                .orderBy(desc(runs.createdAt))
                .limit(1);
            if (existing?.state.verdict) {
                yield event({ type: "accepted", runId: existing.id });
                yield event({
                    type: "trace",
                    event: {
                        ts: new Date().toISOString(),
                        agent: "input-adapter",
                        phase: "done",
                        summary: `Identical input already audited — reusing run ${existing.id}`,
                        data: { reusedRunId: existing.id },
                    },
                });
                yield event({
                    type: "done",
                    runId: existing.id,
                    verdict: existing.state.verdict,
                });
                return;
            }

            const runId = nanoid();
            await db.insert(runs).values({
                id: runId,
                status: "running",
                state: emptyState(body),
                inputKey: key,
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
    .get("/", () => listRuns())
    .get("/:id", async ({ params, status }) => {
        const [row] = await db
            .select()
            .from(runs)
            .where(eq(runs.id, params.id))
            .limit(1);
        if (!row) return status(404, { code: "NOT_FOUND", status: 404 });
        return row;
    });
