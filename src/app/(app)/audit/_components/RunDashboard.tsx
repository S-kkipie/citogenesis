"use client";

import { useMemo, useState } from "react";
import { deriveGraphView } from "@/core/run/client/graph-view";
import type { LiveView } from "@/core/run/client/stream";
import type { RunState } from "@/core/run/domain";
import { CitationGraph } from "./CitationGraph";

export type DashboardMode = "live" | "replay";

export function RunDashboard({
    state,
}: {
    state: RunState | null;
    live?: LiveView;
    mode: DashboardMode;
}) {
    const [selected, setSelected] = useState<string | null>(null);
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
            </section>
            <aside className="flex flex-col overflow-hidden">
                {/* Task 4 fills: VerdictCard, PipelineBar, AuditLog. Task 5: DriftPanel(selected). */}
                <pre className="overflow-auto p-3 text-xs">
                    {selected ?? "no selection"}
                </pre>
            </aside>
        </div>
    );
}
