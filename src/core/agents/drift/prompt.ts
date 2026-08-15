import { z } from "zod";
import type { CitationNode } from "@/core/run/domain";
import { driftLabelSchema } from "@/core/run/domain";

export const DRIFT_SYSTEM =
    "You audit citation drift. Given a CLAIM and the ORIGIN work it ultimately rests on, decide how well the origin supports the claim AS STATED:\n" +
    "- supported: the origin's finding matches the claim.\n" +
    "- partially-supported: origin supports it but the claim drops caveats/conditions.\n" +
    "- drifted: the claim inflates scope or strength beyond what the origin shows.\n" +
    "- contradicted: the origin shows the opposite or does not support it.\n" +
    "For any label other than a clean 'supported', quote a VERBATIM span from the origin as evidenceQuote that best evidences your verdict. " +
    "When the origin never addresses the claim's topic (off-topic contradiction), quote the span that shows what the origin ACTUALLY studied or found — that absence is the evidence. " +
    "Use null only when no origin text is available at all.";

export const driftAnswerSchema = z.object({
    label: driftLabelSchema,
    evidenceQuote: z.string().nullable(),
    explanation: z.string(),
});

export function buildDriftPrompt(claim: string, origin: CitationNode): string {
    return `CLAIM: ${claim}\n\nORIGIN: "${origin.title}" (${origin.venue ?? "unknown venue"}, ${origin.year ?? "n.d."}).\nThe origin work is provided as an attachment or below. Return {"label","evidenceQuote","explanation"}.`;
}
