import { AGENT_ORDER } from "@/core/run/client/stream";
import type { AgentName, TraceEvent } from "@/core/run/domain";

const LABEL: Record<AgentName, string> = {
    "input-adapter": "Input adapter",
    "chain-tracer": "ChainTracer",
    "primacy-judge": "PrimacyJudge",
    "drift-auditor": "DriftAuditor",
    verdict: "Verdict",
};

export function AuditLog({ trace }: { trace: TraceEvent[] }) {
    return (
        <div className="flex-1 overflow-auto p-3 text-xs">
            {AGENT_ORDER.map((agent) => {
                const events = trace.filter((t) => t.agent === agent);
                if (events.length === 0) {
                    return null;
                }

                return (
                    <div key={agent} className="mb-3">
                        <p className="font-semibold text-[#1A1F26]">
                            {LABEL[agent]}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                            {events.map((e, idx) => (
                                <li
                                    key={idx}
                                    className={
                                        e.phase === "recovery"
                                            ? "text-[#9A6700]"
                                            : e.phase === "error"
                                              ? "text-[#CF222E]"
                                              : "text-[#57606A]"
                                    }
                                >
                                    · {e.summary}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}
