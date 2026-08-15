import type { AgentName, RunError } from "@/core/run/domain";

/** Thrown after a model call fails schema validation twice. Callers catch it,
 * record a recovered RunError, and mark-and-continue. */
export class AgentSchemaError extends Error {
    constructor(
        readonly agent: AgentName,
        readonly lastError: string,
    ) {
        super(`[${agent}] schema validation failed after retry: ${lastError}`);
        this.name = "AgentSchemaError";
    }
}

export function recoveredError(agent: AgentName, message: string): RunError {
    return { agent, message, recovered: true };
}
