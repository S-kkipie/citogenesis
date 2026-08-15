import { z } from "zod";
import {
    citationEdgeSchema,
    citationNodeSchema,
    primacySchema,
    workIdSchema,
} from "./graph";
import { driftFindingSchema } from "./state";

/**
 * Ephemeral live-view events. Streamed over SSE while a run executes so the
 * UI can grow the graph and animate agent activity in real time. NEVER
 * persisted — the graph itself is persisted in `RunState.graph`, and the
 * auditable record is the trace.
 */
export const deltaEventOptions = [
    z.object({
        type: z.literal("claim-resolved"),
        claim: z.string(),
        anchors: z.array(workIdSchema),
    }),
    z.object({
        type: z.literal("graph-delta"),
        nodes: z.array(citationNodeSchema),
        edges: z.array(citationEdgeSchema),
    }),
    z.object({
        type: z.literal("nodes-patch"),
        patches: z.array(
            z.object({ id: workIdSchema, primacy: primacySchema }),
        ),
    }),
    z.object({ type: z.literal("origins"), ids: z.array(workIdSchema) }),
    z.object({
        type: z.literal("cycles"),
        cycles: z.array(z.array(workIdSchema)),
    }),
    z.object({
        type: z.literal("drift-finding"),
        finding: driftFindingSchema,
    }),
] as const;

export const deltaEventSchema = z.discriminatedUnion("type", [
    ...deltaEventOptions,
]);
export type DeltaEvent = z.infer<typeof deltaEventSchema>;

/** Ports call this (when given) to push live view updates. Fire-and-forget. */
export type DeltaEmit = (event: DeltaEvent) => void;
