import { desc, sql } from "drizzle-orm";
import type { RunStatus, Verdict } from "@/core/run/domain";
import { db } from "@/server/drizzle/db";
import { runs } from "@/server/drizzle/schemas";

export interface RunListItem {
    id: string;
    createdAt: string;
    status: RunStatus;
    kind: string;
    claim: string | null;
    verdict: Pick<Verdict, "confidence" | "score"> | null;
}

/** History rows without the heavy state blob: jsonb paths do the narrowing in Postgres. */
export async function listRuns(limit = 50): Promise<RunListItem[]> {
    const rows = await db
        .select({
            id: runs.id,
            createdAt: runs.createdAt,
            status: runs.status,
            kind: sql<string>`${runs.state}->'input'->>'kind'`,
            claim: sql<string | null>`nullif(${runs.state}->>'claim', '')`,
            confidence: sql<
                Verdict["confidence"] | null
            >`${runs.state}->'verdict'->>'confidence'`,
            score: sql<
                number | null
            >`(${runs.state}->'verdict'->>'score')::real`,
        })
        .from(runs)
        .orderBy(desc(runs.createdAt))
        .limit(limit);
    return rows.map(({ confidence, score, ...row }) => ({
        ...row,
        verdict:
            confidence !== null && score !== null
                ? { confidence, score }
                : null,
    }));
}
