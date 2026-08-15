import { createUserContent } from "@google/genai";
import type { CallResult } from "@/core/agents/gemini/call-structured";
import { callStructured } from "@/core/agents/gemini/call-structured";
import { MODELS } from "@/core/agents/gemini/client";
import { recoveredError } from "@/core/agents/gemini/errors";
import type { AuditDrift, DriftFinding, RunError } from "@/core/run/domain";
import { resolveOriginContent } from "./fetch-text";
import { buildDriftPrompt, DRIFT_SYSTEM, driftAnswerSchema } from "./prompt";

// biome-ignore lint/suspicious/noExplicitAny: injection seam for tests
type CallStructuredFn = (opts: any) => Promise<CallResult<any>>;
type ResolveFn = typeof resolveOriginContent;

export function makeAuditDrift(
    call: CallStructuredFn,
    resolve: ResolveFn,
): AuditDrift {
    return async (claim, origins, emit) => {
        emit({
            agent: "drift-auditor",
            phase: "start",
            summary: `auditing ${origins.length} origins`,
        });
        const findings: DriftFinding[] = [];
        const errors: RunError[] = [];

        for (const origin of origins) {
            const content = await resolve(origin);
            if (!content) {
                errors.push(
                    recoveredError(
                        "drift-auditor",
                        `no full text or abstract for ${origin.id}`,
                    ),
                );
                emit({
                    agent: "drift-auditor",
                    phase: "recovery",
                    summary: `${origin.id}: no content, skipped`,
                });
                continue;
            }
            const promptText = buildDriftPrompt(claim, origin);
            const contents =
                "part" in content
                    ? createUserContent([promptText, content.part])
                    : createUserContent([
                          `${promptText}\n\nORIGIN ABSTRACT:\n${content.text}`,
                      ]);
            try {
                const { data } = await call({
                    model: MODELS.drift,
                    system: DRIFT_SYSTEM,
                    contents,
                    schema: driftAnswerSchema,
                    agent: "drift-auditor",
                    emit,
                    label: `drift ${origin.id}`,
                });
                findings.push({
                    workId: origin.id,
                    label: data.label,
                    evidenceQuote: data.evidenceQuote,
                    explanation: data.explanation,
                    basis: content.basis,
                });
                emit({
                    agent: "drift-auditor",
                    phase: "progress",
                    summary: `${origin.id}: ${data.label} (${content.basis})`,
                });
            } catch (e) {
                errors.push(
                    recoveredError(
                        "drift-auditor",
                        e instanceof Error ? e.message : String(e),
                    ),
                );
                emit({
                    agent: "drift-auditor",
                    phase: "recovery",
                    summary: `${origin.id}: audit failed, skipped`,
                });
            }
        }
        emit({
            agent: "drift-auditor",
            phase: "done",
            summary: `${findings.length} findings`,
        });
        return { findings, errors };
    };
}

export const auditDrift: AuditDrift = makeAuditDrift(
    callStructured,
    resolveOriginContent,
);
