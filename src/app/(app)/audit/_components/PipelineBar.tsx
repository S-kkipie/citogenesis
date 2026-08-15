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
    idle: "text-[#57606A]",
    running: "text-[#1A1F26] font-semibold",
    done: "text-[#1A7F37]",
    recovered: "text-[#9A6700]",
    error: "text-[#CF222E]",
};

export function PipelineBar({
    agents,
}: {
    agents: Record<AgentName, AgentStatus>;
}) {
    return (
        <div className="flex items-center gap-1 border-b p-3 text-xs">
            {AGENT_ORDER.map((a, i) => (
                <span key={a} className="flex items-center gap-1">
                    <span className={COLOR[agents[a]]}>{LABEL[a]}</span>
                    {i < AGENT_ORDER.length - 1 && (
                        <span className="text-[#57606A]">→</span>
                    )}
                </span>
            ))}
        </div>
    );
}
