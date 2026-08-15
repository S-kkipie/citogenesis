"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
    initialLiveView,
    type LiveView,
    liveRunState,
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
    const inputRef = useRef<RunInput | null>(null);

    const start = useCallback(async (input: RunInput) => {
        inputRef.current = input;
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

            for await (const chunk of data) {
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

        // Reached only when the stream ended without a "failed" SSE event
        // and without throwing — i.e. it just ran out of chunks. That's not
        // proof of success on its own: the accepted event may never have
        // arrived, the GET below can fail independently, or the record can
        // simply not be "done" yet. The persisted record's `status` is the
        // single authority for "done" — everything else here is "failed".
        if (!runId) {
            setStatus("failed");
            return;
        }

        try {
            const res = await apiClient.api.v1.runs({ id: runId }).get();
            const record = res.data;
            if (res.error || !record?.state) {
                setStatus("failed");
                return;
            }
            setState(record.state);
            setStatus(record.status === "done" ? "done" : "failed");
        } catch {
            // GET rejected (network/client error) — never let that surface
            // as an unhandled rejection to the caller of start().
            setStatus("failed");
        }
    }, []);

    // Compute display state: use settled state if available, else synthesize from live.
    // Ref is intentionally not in deps: it's stable per run, and live changes on every progress event.
    const displayState = useMemo(
        () =>
            state ??
            (live && inputRef.current
                ? liveRunState(live, inputRef.current)
                : null),
        [state, live],
    );

    return { live, state: displayState, start, status };
}
