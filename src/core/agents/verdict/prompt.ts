import { z } from "zod";
import type { DriftFinding } from "@/core/run/domain";
import type { ScoreResult } from "./score";

export const VERDICT_SYSTEM =
    "You write a short, factual justification for a citation-provenance verdict. " +
    "The numeric score, confidence, and pathogens are FIXED (computed elsewhere) — never dispute or recompute them. " +
    "Explain WHY in <=120 words, referencing the pathogens and drift evidence. No preamble.";

export const proseSchema = z.object({ prose: z.string() });

export function buildVerdictPrompt(
    claim: string,
    score: ScoreResult,
    drift: DriftFinding[],
): string {
    return `CLAIM: ${claim}\n\nFIXED RESULT: ${JSON.stringify({
        confidence: score.confidence,
        score: score.score,
        pathogens: score.pathogens,
        primaryRatio: Number(score.primaryRatio.toFixed(2)),
        coverage: score.coverage,
    })}\n\nDRIFT EVIDENCE: ${JSON.stringify(
        drift.map((d) => ({ label: d.label, quote: d.evidenceQuote })),
    )}\n\nWrite {"prose"}.`;
}

/** Deterministic fallback used when the prose LLM call fails. */
export function templateProse(score: ScoreResult): string {
    const p = score.pathogens.length
        ? `Pathogens: ${score.pathogens.join(", ")}.`
        : "No pathogens detected.";
    return `Confidence ${score.confidence} (score ${score.score}/100). ${p} Primary-source ratio ${Math.round(score.primaryRatio * 100)}%, coverage ${score.coverage.resolved}/${score.coverage.total} nodes resolved.`;
}
