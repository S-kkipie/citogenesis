"use client";

import { AGENT_ORDER, type AgentStatus } from "@/core/run/client/stream";
import type { AgentName, TraceEvent, Verdict } from "@/core/run/domain";
import { TraceFeed } from "./TraceFeed";
import { VerdictCard } from "./VerdictCard";

const META: Record<AgentName, { label: string; role: string }> = {
    "input-adapter": { label: "Input", role: "claim → anchors" },
    "chain-tracer": { label: "ChainTracer", role: "BFS over references" },
    "primacy-judge": { label: "PrimacyJudge", role: "primary vs secondary" },
    "drift-auditor": { label: "DriftAuditor", role: "origin vs claim" },
    verdict: { label: "Verdict", role: "score + pathogens" },
};

const STATUS_GLYPH: Record<AgentStatus, string> = {
    idle: "·",
    running: "▶",
    done: "✓",
    recovered: "⚠",
    error: "✕",
};

function lastSummary(trace: TraceEvent[], agent: AgentName): string | null {
    for (let i = trace.length - 1; i >= 0; i--) {
        if (trace[i].agent === agent) return trace[i].summary;
    }
    return null;
}

export interface RailCounts {
    nodes: number;
    edges: number;
    origins: number;
    drifts: number;
}

/**
 * The orchestration scene: the five agents as a vertical pipeline with live
 * status, per-agent stats, animated handoffs, and the verdict landing in the
 * final card. The trace feed tails the run underneath.
 */
export function OrchestraRail({
    agents,
    trace,
    verdict,
    counts,
    failureMessage,
}: {
    agents: Record<AgentName, AgentStatus>;
    trace: TraceEvent[];
    verdict: Verdict | null;
    counts: RailCounts;
    failureMessage?: string;
}) {
    const statLine = (agent: AgentName): string | null => {
        switch (agent) {
            case "chain-tracer":
                return counts.nodes > 0
                    ? `${counts.nodes} nodes · ${counts.edges} edges`
                    : lastSummary(trace, agent);
            case "primacy-judge":
                return counts.origins > 0
                    ? `${counts.origins} origin candidate(s)`
                    : lastSummary(trace, agent);
            case "drift-auditor":
                return counts.drifts > 0
                    ? `${counts.drifts} drift finding(s)`
                    : lastSummary(trace, agent);
            default:
                return lastSummary(trace, agent);
        }
    };

    const anyErrored = AGENT_ORDER.some((a) => agents[a] === "error");

    return (
        <aside className="order-2 flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--au-paper-2)] md:order-1">
            <div className="min-h-0 shrink overflow-auto p-3">
                {AGENT_ORDER.map((agent, i) => {
                    const status = agents[agent];
                    const next = AGENT_ORDER[i + 1];
                    const handing =
                        next !== undefined &&
                        status === "done" &&
                        agents[next] === "running";
                    return (
                        <div key={agent}>
                            <div className={`rail-card rail-${status}`}>
                                <div className="flex items-center gap-2">
                                    <span className="rail-glyph font-[family-name:var(--font-mono)]">
                                        {STATUS_GLYPH[status]}
                                    </span>
                                    <span className="font-[family-name:var(--font-display)] font-semibold text-[var(--au-ink)] text-sm">
                                        {META[agent].label}
                                    </span>
                                    {status !== "idle" && (
                                        <span className="ml-auto text-[10px] text-[var(--au-neutral)] uppercase tracking-wide">
                                            {status}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 truncate font-[family-name:var(--font-mono)] text-[11px] text-[var(--au-muted)]">
                                    {status === "idle"
                                        ? META[agent].role
                                        : (statLine(agent) ?? META[agent].role)}
                                </p>
                                {status === "error" && failureMessage && (
                                    <p
                                        role="alert"
                                        className="mt-1 text-[11px] text-[var(--au-flag)]"
                                    >
                                        {failureMessage}
                                    </p>
                                )}
                                {agent === "verdict" && (
                                    <VerdictCard verdict={verdict} embedded />
                                )}
                            </div>
                            {next !== undefined && (
                                <div
                                    className={`rail-connector${handing ? " rail-handing" : ""}`}
                                    aria-hidden="true"
                                />
                            )}
                        </div>
                    );
                })}
                {failureMessage && !anyErrored && (
                    <p
                        role="alert"
                        className="mt-2 text-[11px] text-[var(--au-flag)]"
                    >
                        {failureMessage}
                    </p>
                )}
            </div>
            <TraceFeed trace={trace} />
        </aside>
    );
}
