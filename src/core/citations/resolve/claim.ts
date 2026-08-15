import type { WorkId } from "../../run/domain/graph";
import type { RunError } from "../../run/domain/state";
import type { TraceEmit } from "../../run/domain/trace";
import { searchWorks } from "../clients/openalex";
import type { OpenAlexOpts } from "../types";

export interface ClaimDeps {
    searchWorks: typeof searchWorks;
}
const DEFAULTS: ClaimDeps = { searchWorks };

export async function resolveClaim(
    text: string,
    emit: TraceEmit,
    opts: OpenAlexOpts,
    deps: Partial<ClaimDeps> = {},
): Promise<{ anchors: WorkId[]; errors: RunError[] }> {
    const d = { ...DEFAULTS, ...deps };
    const hits = await d.searchWorks(text, 10, opts);
    if (hits.length === 0)
        throw new Error(`No OpenAlex results for claim: ${text}`);

    emit({
        agent: "input-adapter",
        phase: "progress",
        summary: `${hits.length} candidates; top ${Math.min(5, hits.length)} recorded`,
        data: {
            candidates: hits.slice(0, 5).map((fw) => ({
                id: fw.node.id,
                title: fw.node.title,
                year: fw.node.year,
                citedByCount: fw.node.citedByCount,
                hasRefs: fw.referencedWorks.length > 0,
            })),
        },
    });

    const withRefs = hits.find((fw) => fw.referencedWorks.length > 0);
    if (withRefs) return { anchors: [withRefs.node.id], errors: [] };

    return {
        anchors: [hits[0].node.id],
        errors: [
            {
                agent: "input-adapter",
                recovered: true,
                message:
                    "No candidate had references; anchored to top relevance result (weak anchor)",
            },
        ],
    };
}
