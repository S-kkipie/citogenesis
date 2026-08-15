import type { WorkId } from "../../run/domain/graph";

export interface RefCandidate {
    id: WorkId;
    topicIds: string[];
    year: number | null;
}

function overlap(topicIds: string[], claim: Set<string>): number {
    let n = 0;
    for (const t of topicIds) if (claim.has(t)) n++;
    return n;
}

export function prioritizeRefs(
    cands: RefCandidate[],
    claimTopics: Set<string>,
    limit: number,
): RefCandidate[] {
    return [...cands]
        .sort((a, b) => {
            const d =
                overlap(b.topicIds, claimTopics) -
                overlap(a.topicIds, claimTopics);
            if (d !== 0) return d;
            return (a.year ?? Infinity) - (b.year ?? Infinity);
        })
        .slice(0, limit);
}
