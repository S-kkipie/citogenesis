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
import dynamic from "next/dynamic";

// Sigma renders into a client-measured canvas the server can't reproduce,
// so the graph is client-only.
const CitationGraph = dynamic(
    () => import("./CitationGraph").then((m) => m.CitationGraph),
    { ssr: false },
);

import { Legend } from "./Legend";
import { NodePanel } from "./NodePanel";
import { OrchestraRail } from "./OrchestraRail";

export type DashboardMode = "live" | "replay";

const NODE_CASCADE_STEP_MS = 420;
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

    // Live runs grow in place; replay (and the Replay button) cascade.
    const cascade = mode === "replay" || revealKey > 0;
    const finished = mode === "replay" || live?.terminal === "done";
    const running = mode === "live" && live !== undefined && !live.terminal;

    // A cleared run (new run starting) closes the inspector.
    useEffect(() => {
        if (!state) {
            setSelected(null);
            setRevealKey(0);
        }
    }, [state]);

    // Auto-open the worst drifted origin — but only once the run is over.
    // Mid-run the state changes on every delta; touching the selection then
    // would fight the user's own clicks.
    // biome-ignore lint/correctness/useExhaustiveDependencies: revealKey deliberately restarts this sequence on Replay.
    useEffect(() => {
        if (!state || !finished) return;

        const origin = worstDriftOrigin(state);
        if (!origin) return;

        const maxDepth = state.graph.nodes.reduce(
            (deepest, node) => Math.max(deepest, node.depth),
            0,
        );
        const delay = cascade
            ? maxDepth * NODE_CASCADE_STEP_MS + NODE_REVEAL_DURATION_MS
            : NODE_REVEAL_DURATION_MS;
        const timer = window.setTimeout(() => setSelected(origin), delay);

        return () => window.clearTimeout(timer);
    }, [revealKey, state, finished, cascade]);

    return (
        <div className="audit-scope grid h-[calc(100svh-3.5rem)] grid-cols-[320px_1fr] bg-[var(--au-paper)] font-[family-name:var(--font-body)] text-[var(--au-ink)]">
            <OrchestraRail
                agents={displayAgents}
                trace={live?.trace ?? state?.trace ?? []}
                verdict={state?.verdict ?? live?.verdict ?? null}
                counts={{
                    nodes: state?.graph.nodes.length ?? 0,
                    edges: state?.graph.edges.length ?? 0,
                    origins: state?.originCandidates.length ?? 0,
                    drifts: state?.driftFindings.length ?? 0,
                }}
                failureMessage={
                    live?.terminal === "failed"
                        ? (live.failureMessage ?? "Run failed.")
                        : undefined
                }
            />
            <section className="relative border-[var(--au-rule)] border-l bg-[var(--au-canvas)]">
                {view ? (
                    <>
                        <CitationGraph
                            key={revealKey}
                            view={view}
                            cascade={cascade}
                            onNodeClick={setSelected}
                            selectedId={selected}
                            insetRight={state && selected ? 360 : 0}
                        />
                        <button
                            type="button"
                            onClick={() => setRevealKey((key) => key + 1)}
                            className="absolute top-3 left-3 z-10 rounded border border-[var(--au-canvas-rule)] bg-[var(--au-canvas)]/90 px-2 py-1 text-[var(--au-canvas-ink)] text-xs shadow-sm hover:bg-[var(--au-canvas)]"
                        >
                            Replay
                        </button>
                    </>
                ) : running ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-[var(--au-canvas-ink)]/70">
                        <span className="animate-pulse font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest">
                            resolving anchors…
                        </span>
                        {live?.partial.claim && (
                            <p className="max-w-md text-center text-sm">
                                “{live.partial.claim}”
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center text-[var(--au-canvas-ink)]/60">
                        Enter a claim to begin.
                    </div>
                )}
                {state && selected && (
                    <NodePanel
                        state={state}
                        selectedId={selected}
                        onClose={() => setSelected(null)}
                    />
                )}
                <Legend />
            </section>
        </div>
    );
}
