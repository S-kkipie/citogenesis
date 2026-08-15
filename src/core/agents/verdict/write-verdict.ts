import type { CallResult } from "@/core/agents/gemini/call-structured";
import { callStructured } from "@/core/agents/gemini/call-structured";
import { MODELS } from "@/core/agents/gemini/client";
import type { Verdict, WriteVerdict } from "@/core/run/domain";
import {
    buildVerdictPrompt,
    proseSchema,
    templateProse,
    VERDICT_SYSTEM,
} from "./prompt";
import { scoreVerdict } from "./score";

// biome-ignore lint/suspicious/noExplicitAny: injection seam for tests
type CallStructuredFn = (opts: any) => Promise<CallResult<any>>;

export function makeWriteVerdict(call: CallStructuredFn): WriteVerdict {
    return async ({ claim, graph, cycles, driftFindings }, emit) => {
        emit({ agent: "verdict", phase: "start", summary: "scoring verdict" });
        const score = scoreVerdict({ graph, cycles, driftFindings });
        emit({
            agent: "verdict",
            phase: "progress",
            summary: `${score.confidence} (${score.score}) ${score.pathogens.join(",") || "no pathogens"}`,
        });

        let prose: string;
        try {
            const { data } = await call({
                model: MODELS.verdict,
                system: VERDICT_SYSTEM,
                contents: buildVerdictPrompt(claim, score, driftFindings),
                schema: proseSchema,
                agent: "verdict",
                emit,
                label: "verdict prose",
            });
            prose = data.prose;
        } catch {
            prose = templateProse(score);
            emit({
                agent: "verdict",
                phase: "recovery",
                summary: "prose LLM failed → template",
            });
        }

        const verdict: Verdict = { ...score, prose };
        emit({
            agent: "verdict",
            phase: "done",
            summary: `verdict: ${verdict.confidence}`,
        });
        return verdict;
    };
}

export const writeVerdict: WriteVerdict = makeWriteVerdict(callStructured);
