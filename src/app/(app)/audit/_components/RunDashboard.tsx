"use client";

import { useMemo, useState } from "react";
import { deriveGraphView } from "@/core/run/client/graph-view";
import {
    AGENT_ORDER,
    type AgentStatus,
    type LiveView,
} from "@/core/run/client/stream";
import type { AgentName, RunState } from "@/core/run/domain";
import { AuditLog } from "./AuditLog";
import { CitationGraph } from "./CitationGraph";
import { Legend } from "./Legend";
import { PipelineBar } from "./PipelineBar";
import { VerdictCard } from "./VerdictCard";

export type DashboardMode = "live" | "replay";

export function RunDashboard({
    state,
    live,
    mode: _mode,
}: {
    state: RunState | null;
    live?: LiveView;
    mode: DashboardMode;
}) {
    const [, setSelected] = useState<string | null>(null);
    const displayAgents =
        live?.agents ??
        (Object.fromEntries(
            AGENT_ORDER.map((a) => [a, "done" as const]),
        ) as Record<AgentName, AgentStatus>);

    const view = useMemo(
        () => (state ? deriveGraphView(state) : null),
        [state],
    );

    return (
        <div className="grid h-[calc(100svh-3.5rem)] grid-cols-[1fr_360px]">
            <section className="relative border-r">
                {view ? (
                    <CitationGraph view={view} onNodeClick={setSelected} />
                ) : (
                    <div className="flex h-full items-center justify-center text-[#57606A]">
                        Enter a claim to begin.
                    </div>
                )}
                <Legend />
            </section>
            <aside className="flex flex-col overflow-hidden">
                <VerdictCard verdict={state?.verdict ?? null} />
                <PipelineBar agents={displayAgents} />
                <AuditLog trace={live?.trace ?? state?.trace ?? []} />
            </aside>
        </div>
    );
}
