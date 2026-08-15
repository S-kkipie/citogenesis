"use client";

import { useEffect, useRef } from "react";
import type { AgentName, TraceEvent } from "@/core/run/domain";

const SHORT: Record<AgentName, string> = {
    "input-adapter": "input",
    "chain-tracer": "tracer",
    "primacy-judge": "primacy",
    "drift-auditor": "drift",
    verdict: "verdict",
};

const PHASE_CLASS: Record<TraceEvent["phase"], string> = {
    start: "text-[var(--au-neutral)]",
    progress: "text-[var(--au-neutral)]",
    handoff: "text-[var(--au-accent)]",
    recovery: "text-[var(--au-caution)]",
    error: "text-[var(--au-flag)]",
    done: "text-[var(--au-healthy)]",
};

/** Chronological run log. Follows the newest event like a terminal tail. */
export function TraceFeed({ trace }: { trace: TraceEvent[] }) {
    const ref = useRef<HTMLDivElement>(null);

    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll only when entries are appended, not when the array identity churns.
    useEffect(() => {
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [trace.length]);

    return (
        <div
            ref={ref}
            className="min-h-0 flex-1 overflow-auto border-[var(--au-rule)] border-t p-2 font-[family-name:var(--font-mono)] text-[11px] leading-5"
        >
            {trace.length === 0 && (
                <p className="text-[var(--au-neutral)]">No events yet.</p>
            )}
            {trace.map((e, idx) => (
                <p key={idx} className={PHASE_CLASS[e.phase]}>
                    <span className="text-[var(--au-neutral)]">
                        [{SHORT[e.agent]}]
                    </span>{" "}
                    {e.summary}
                </p>
            ))}
        </div>
    );
}
