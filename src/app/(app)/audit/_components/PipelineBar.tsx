import { AGENT_ORDER, type AgentStatus } from "@/core/run/client/stream";
import type { AgentName } from "@/core/run/domain";

const LABEL: Record<AgentName, string> = {
    "input-adapter": "Input",
    "chain-tracer": "Tracer",
    "primacy-judge": "Primacy",
    "drift-auditor": "Drift",
    verdict: "Verdict",
};

const COLOR: Record<AgentStatus, string> = {
    idle: "text-[var(--au-neutral)]",
    running: "text-[var(--au-ink)] font-semibold",
    done: "text-[var(--au-healthy)]",
    recovered: "text-[var(--au-caution)]",
    error: "text-[var(--au-flag)]",
};

export function PipelineBar({
    agents,
}: {
    agents: Record<AgentName, AgentStatus>;
}) {
    return (
        <div className="flex items-center gap-1 border-[var(--au-rule)] border-b p-3 text-xs">
            {AGENT_ORDER.map((a, i) => (
                <span key={a} className="flex items-center gap-1">
                    <span className={COLOR[agents[a]]}>{LABEL[a]}</span>
                    {i < AGENT_ORDER.length - 1 && (
                        <span className="text-[var(--au-neutral)]">→</span>
                    )}
                </span>
            ))}
        </div>
    );
}
