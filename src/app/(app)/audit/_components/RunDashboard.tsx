"use client";

import { useEffect, useMemo, useState } from "react";
import {
    deriveGraphView,
    worstDriftOrigin,
} from "@/core/run/client/graph-view";
import {
    AGENT_ORDER,
    type AgentStatus,
    initialLiveView,
    type LiveView,
} from "@/core/run/client/stream";
import type { AgentName, RunState } from "@/core/run/domain";
import "../audit.css";
import { AuditLog } from "./AuditLog";
import { CitationGraph } from "./CitationGraph";
import { DriftPanel } from "./DriftPanel";
import { Legend } from "./Legend";
import { PipelineBar } from "./PipelineBar";
import { VerdictCard } from "./VerdictCard";

export type DashboardMode = "live" | "replay";

const NODE_CASCADE_STEP_MS = 220;
const NODE_REVEAL_DURATION_MS = 420;

export function RunDashboard({
    state,
    live,
    mode,
}: {
    state: RunState | null;
    live?: LiveView;
    mode: DashboardMode;
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const [revealKey, setRevealKey] = useState(0);
    const displayAgents: Record<AgentName, AgentStatus> =
        live?.agents ??
        (mode === "replay"
            ? (Object.fromEntries(
                  AGENT_ORDER.map((a) => [a, "done" as const]),
              ) as Record<AgentName, AgentStatus>)
            : initialLiveView().agents);

    const view = useMemo(
        () => (state ? deriveGraphView(state) : null),
        [state],
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: revealKey deliberately restarts this sequence on Replay.
    useEffect(() => {
        setSelected(null);
        if (!state) return;

        const origin = worstDriftOrigin(state);
        if (!origin) return;

        const maxDepth = state.graph.nodes.reduce(
            (deepest, node) => Math.max(deepest, node.depth),
            0,
        );
        const timer = window.setTimeout(
            () => setSelected(origin),
            maxDepth * NODE_CASCADE_STEP_MS + NODE_REVEAL_DURATION_MS,
        );

        return () => window.clearTimeout(timer);
    }, [revealKey, state]);

    return (
        <div className="audit-scope grid h-[calc(100svh-3.5rem)] grid-cols-[1fr_360px] bg-[var(--au-paper)] font-[family-name:var(--font-body)] text-[var(--au-ink)]">
            <section className="relative border-[var(--au-rule)] border-r bg-[var(--au-canvas)]">
                {live?.terminal === "failed" && (
                    <div
                        role="alert"
                        className="absolute top-0 right-0 left-0 z-20 border-[var(--au-flag)] border-b bg-[var(--au-paper-2)] px-4 py-2 font-[family-name:var(--font-mono)] text-[var(--au-flag)] text-xs"
                    >
                        {live.failureMessage || "Run failed."}
                    </div>
                )}
                {view ? (
                    <>
                        <CitationGraph
                            key={revealKey}
                            view={view}
                            onNodeClick={setSelected}
                        />
                        <button
                            type="button"
                            onClick={() => setRevealKey((key) => key + 1)}
                            className="absolute top-3 left-3 z-10 rounded border border-[var(--au-canvas-rule)] bg-[var(--au-canvas)]/90 px-2 py-1 text-[var(--au-canvas-ink)] text-xs shadow-sm hover:bg-[var(--au-canvas)]"
                        >
                            Replay
                        </button>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center text-[var(--au-canvas-ink)]/60">
                        Enter a claim to begin.
                    </div>
                )}
                {state && selected && (
                    <DriftPanel
                        state={state}
                        selectedId={selected}
                        onClose={() => setSelected(null)}
                    />
                )}
                <Legend />
            </section>
            <aside className="flex flex-col overflow-hidden border-[var(--au-rule)] border-l bg-[var(--au-paper-2)]">
                <VerdictCard verdict={state?.verdict ?? null} />
                <PipelineBar agents={displayAgents} />
                <AuditLog trace={live?.trace ?? state?.trace ?? []} />
            </aside>
        </div>
    );
}
