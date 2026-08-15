"use client";

import { useCallback, useState } from "react";
import {
    initialLiveView,
    type LiveView,
    streamReducer,
} from "@/core/run/client/stream";
import {
    type RunInput,
    type RunState,
    runSseEventSchema,
} from "@/core/run/domain";
import { apiClient } from "@/frontend/lib/eden";

type Status = "idle" | "running" | "done" | "failed";

/**
 * A yielded SSE chunk may arrive either as the raw `RunSseEvent` or as an
 * envelope carrying it under `.data` (Eden's parsed `{ event, data }` frame
 * for `text/event-stream` responses). We don't trust either shape blindly —
 * `runSseEventSchema.safeParse` is the real gate.
 */
function unwrapChunk(chunk: unknown): unknown {
    if (chunk && typeof chunk === "object" && "type" in chunk) {
        return chunk;
    }
    if (chunk && typeof chunk === "object" && "data" in chunk) {
        return (chunk as { data?: unknown }).data;
    }
    return chunk;
}

export function useRunStream() {
    const [live, setLive] = useState<LiveView | null>(null);
    const [state, setState] = useState<RunState | null>(null);
    const [status, setStatus] = useState<Status>("idle");

    const start = useCallback(async (input: RunInput) => {
        setState(null);
        setStatus("running");
        let view = initialLiveView();
        setLive(view);

        let runId: string | undefined;

        try {
            const { data, error } = await apiClient.api.v1.runs.post(input);
            if (error || !data) {
                setStatus("failed");
                return;
            }

            let loggedFirstChunk = false;
            for await (const chunk of data) {
                if (!loggedFirstChunk) {
                    console.log("[useRunStream] first SSE chunk:", chunk);
                    loggedFirstChunk = true;
                }
                const raw = unwrapChunk(chunk);
                const parsed = runSseEventSchema.safeParse(raw);
                if (!parsed.success) continue;

                view = streamReducer(view, parsed.data);
                setLive({ ...view });

                if (parsed.data.type === "accepted") {
                    runId = parsed.data.runId;
                }
                if (parsed.data.type === "failed") {
                    setStatus("failed");
                    return;
                }
            }
        } catch {
            // Stream dropped without a terminal event (network error, server
            // crash mid-generator). Don't leave status stuck on "running".
            setStatus("failed");
            return;
        }

        // Full state (graph/drift/verdict) is fetched once the stream ends,
        // rather than reconstructed from trace events alone.
        if (runId) {
            const res = await apiClient.api.v1.runs({ id: runId }).get();
            if (res.data) {
                setState(res.data.state);
            }
        }
        setStatus("done");
    }, []);

    return { live, state, start, status };
}
