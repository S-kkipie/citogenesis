import { z } from "zod";

/** OpenAlex work id, e.g. "W2741809807". */
export const workIdSchema = z.string().regex(/^W\d+$/);
export type WorkId = z.infer<typeof workIdSchema>;

export const primacyLabelSchema = z.enum(["primary", "secondary", "unknown"]);
export type PrimacyLabel = z.infer<typeof primacyLabelSchema>;

/** Set by PrimacyJudge. Heuristic (OpenAlex `type`) or LLM when ambiguous. */
export const primacySchema = z.object({
    label: primacyLabelSchema,
    method: z.enum(["heuristic", "llm"]),
    rationale: z.string().optional(),
});
export type Primacy = z.infer<typeof primacySchema>;

export const citationNodeSchema = z.object({
    id: workIdSchema,
    title: z.string(),
    year: z.number().int().nullable(),
    doi: z.string().nullable(),
    /** OpenAlex `type`: article | review | preprint | editorial | letter | ... */
    type: z.string(),
    venue: z.string().nullable(),
    authors: z.array(z.string()),
    abstract: z.string().nullable(),
    citedByCount: z.number().int(),
    isRetracted: z.boolean(),
    /** Best OA full-text location (PDF or landing page), when open access. */
    oaUrl: z.string().nullable(),
    /** BFS distance from the anchor (0 = anchor itself). */
    depth: z.number().int().min(0),
    source: z.enum(["openalex", "semanticscholar"]),
    /**
     * `unresolved` = both data sources failed; node kept for coverage stats.
     * Convention: unresolved nodes carry placeholders in non-nullable fields
     * (title "(unresolved)", type "unknown", counts 0, flags false, rest
     * null). Consumers MUST branch on fetchStatus, never on placeholder
     * values.
     */
    fetchStatus: z.enum(["resolved", "unresolved"]),
    primacy: primacySchema.optional(),
});
export type CitationNode = z.infer<typeof citationNodeSchema>;

/** Directed: `from` cites `to` (backwards in time, forwards in the BFS). */
export const citationEdgeSchema = z.object({
    from: workIdSchema,
    to: workIdSchema,
});
export type CitationEdge = z.infer<typeof citationEdgeSchema>;

export const citationGraphSchema = z.object({
    nodes: z.array(citationNodeSchema),
    edges: z.array(citationEdgeSchema),
    /** true when a BFS budget cap cut the expansion short. */
    truncated: z.boolean(),
});
export type CitationGraph = z.infer<typeof citationGraphSchema>;

/** BFS budget — the numbers locked in the stack spec. Do not raise casually:
 * run time and OpenAlex quota scale with these. */
export const TRACE_BUDGET = {
    maxDepth: 3,
    maxRefsPerNode: 25,
    maxNodes: 200,
} as const;
export type TraceBudget = typeof TRACE_BUDGET;
