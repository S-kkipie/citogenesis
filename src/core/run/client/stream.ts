import type {
    AgentName,
    RunSseEvent,
    TraceEvent,
    Verdict,
} from "@/core/run/domain";

export type AgentStatus = "idle" | "running" | "done" | "recovered" | "error";

export const AGENT_ORDER: AgentName[] = [
    "input-adapter",
    "chain-tracer",
    "primacy-judge",
    "drift-auditor",
    "verdict",
];

export interface LiveView {
    runId?: string;
    agents: Record<AgentName, AgentStatus>;
    trace: TraceEvent[];
    terminal?: "done" | "failed";
    verdict?: Verdict;
    failureMessage?: string;
}

export function initialLiveView(): LiveView {
    return {
        agents: {
            "input-adapter": "idle",
            "chain-tracer": "idle",
            "primacy-judge": "idle",
            "drift-auditor": "idle",
            verdict: "idle",
        },
        trace: [],
    };
}

function statusFromPhase(phase: TraceEvent["phase"]): AgentStatus {
    switch (phase) {
        case "start":
        case "progress":
            return "running";
        case "recovery":
            return "recovered";
        case "error":
            return "error";
        case "handoff":
        case "done":
            return "done";
    }
}

export function streamReducer(view: LiveView, event: RunSseEvent): LiveView {
    switch (event.type) {
        case "accepted":
            return { ...view, runId: event.runId };
        case "trace": {
            const t = event.event;
            const agents = {
                ...view.agents,
                [t.agent]: statusFromPhase(t.phase),
            };
            return { ...view, trace: [...view.trace, t], agents };
        }
        case "done": {
            const agents = { ...view.agents };
            for (const a of AGENT_ORDER) {
                if (agents[a] !== "error") {
                    agents[a] = "done";
                }
            }
            return {
                ...view,
                terminal: "done",
                verdict: event.verdict,
                runId: event.runId,
                agents,
            };
        }
        case "failed":
            return {
                ...view,
                terminal: "failed",
                failureMessage: event.message,
                runId: event.runId,
            };
    }
}
