import { z } from "zod";
import type { CitationNode } from "@/core/run/domain";
import { primacyLabelSchema, workIdSchema } from "@/core/run/domain";

export const PRIMACY_SYSTEM =
    "You classify scientific works as PRIMARY (reports original data/experiments/analysis) " +
    "or SECONDARY (review, commentary, opinion, news, or summarizes others' work). " +
    "Use UNKNOWN only when the metadata is too thin to tell. Judge each work independently.";

export const primacyBatchSchema = z.object({
    results: z.array(
        z.object({
            id: workIdSchema,
            label: primacyLabelSchema,
            rationale: z.string(),
        }),
    ),
});
export type PrimacyBatch = z.infer<typeof primacyBatchSchema>;

export function buildPrimacyPrompt(nodes: CitationNode[]): string {
    const items = nodes.map((n) => ({
        id: n.id,
        title: n.title,
        type: n.type,
        venue: n.venue,
        year: n.year,
        abstract: n.abstract?.slice(0, 1500) ?? null,
    }));
    return `Classify each work. Return {"results":[{"id","label","rationale"}]} covering every id exactly once.\n\n${JSON.stringify(items, null, 2)}`;
}
