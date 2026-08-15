import { z } from "zod";
import { citationGraphSchema, workIdSchema } from "./graph";
import { agentNameSchema, traceEventSchema } from "./trace";

/** The three input doors. Adapters normalize all of them to (claim, anchors). */
export const runInputSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("claim"), text: z.string().min(8) }),
    /** arXiv id, DOI, or OpenAlex id. */
    z.object({ kind: z.literal("paper"), id: z.string().min(3) }),
    z.object({
        kind: z.literal("wikipedia"),
        url: z.url(),
        /** The statement whose `[n]` refs to audit; omit = adapter picks. */
        statement: z.string().optional(),
    }),
]);
export type RunInput = z.infer<typeof runInputSchema>;

export const pathogenSchema = z.enum([
    "circular-support",
    "no-primary-source",
    "single-point-of-failure",
    "claim-drift",
]);
export type Pathogen = z.infer<typeof pathogenSchema>;

export const driftLabelSchema = z.enum([
    "supported",
    "partially-supported",
    "drifted",
    "contradicted",
]);
export type DriftLabel = z.infer<typeof driftLabelSchema>;

export const driftFindingSchema = z.object({
    workId: workIdSchema,
    label: driftLabelSchema,
    /** Verbatim span from the origin text backing the label. */
    evidenceQuote: z.string().nullable(),
    explanation: z.string(),
    /** `abstract` = full text unavailable, lower-confidence fallback. */
    basis: z.enum(["fulltext", "abstract"]),
});
export type DriftFinding = z.infer<typeof driftFindingSchema>;

export const verdictSchema = z.object({
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    /** 0–100, computed deterministically in code — never by the LLM. */
    score: z.number().min(0).max(100),
    pathogens: z.array(pathogenSchema),
    /** primary nodes / labeled nodes. */
    primaryRatio: z.number().min(0).max(1),
    coverage: z.object({
        resolved: z.number().int(),
        total: z.number().int(),
    }),
    /** LLM-written justification. Words from the model, numbers from code. */
    prose: z.string(),
});
export type Verdict = z.infer<typeof verdictSchema>;

export const runErrorSchema = z.object({
    agent: agentNameSchema,
    message: z.string(),
    /** true = pipeline continued (fallback/skip); false = run aborted. */
    recovered: z.boolean(),
});
export type RunError = z.infer<typeof runErrorSchema>;

/**
 * The whole run state. Serializable end-to-end: persisted to Postgres,
 * returned by GET /runs/:id, rendered by the frontend.
 */
export const runStateSchema = z.object({
    input: runInputSchema,
    /** Normalized claim text (set by the input adapter). */
    claim: z.string(),
    /** Works the claim was anchored to (BFS roots). */
    anchors: z.array(workIdSchema),
    graph: citationGraphSchema,
    /** Citation cycles found during traversal (pathogen: circular-support). */
    cycles: z.array(z.array(workIdSchema)),
    /** Chain roots feeding DriftAuditor (≤3). */
    originCandidates: z.array(workIdSchema),
    driftFindings: z.array(driftFindingSchema),
    verdict: verdictSchema.nullable(),
    trace: z.array(traceEventSchema),
    errors: z.array(runErrorSchema),
});
export type RunState = z.infer<typeof runStateSchema>;
