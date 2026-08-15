import Link from "next/link";
import type { RunState, RunStatus, Verdict } from "@/core/run/domain";

/**
 * Server component: reads the last 50 runs directly from Postgres (same
 * query as GET /api/v1/runs) rather than fetching our own API — see
 * `[id]/page.tsx` for why. Drizzle is imported lazily so the module needs
 * no env access until this page actually renders.
 */

type RunRow = {
    id: string;
    createdAt: string;
    status: RunStatus;
    kind: RunState["input"]["kind"];
    claim: string | null;
    verdict: Pick<Verdict, "confidence" | "score"> | null;
};

const STATUS_COLOR: Record<RunStatus, string> = {
    done: "text-[var(--au-healthy)]",
    failed: "text-[var(--au-flag)]",
    running: "text-[var(--au-caution)]",
};

function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

export default async function RunsPage() {
    // Imported lazily so this module needs no database and no env until
    // the page actually renders.
    const [{ desc }, { db }, { runs }] = await Promise.all([
        import("drizzle-orm"),
        import("@/server/drizzle/db"),
        import("@/server/drizzle/schemas"),
    ]);

    const rows = await db
        .select()
        .from(runs)
        .orderBy(desc(runs.createdAt))
        .limit(50);

    const history: RunRow[] = rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        status: row.status,
        kind: row.state.input.kind,
        claim: row.state.claim || null,
        verdict: row.state.verdict
            ? {
                  confidence: row.state.verdict.confidence,
                  score: row.state.verdict.score,
              }
            : null,
    }));

    return (
        <div className="p-6">
            <h1 className="font-[family-name:var(--font-display)] font-semibold text-[var(--au-ink)] text-lg">
                Run history
            </h1>

            {history.length === 0 ? (
                <p className="mt-16 text-center text-[var(--au-muted)] text-sm">
                    No runs yet.
                </p>
            ) : (
                <div className="mt-4 overflow-x-auto rounded border border-[var(--au-rule)]">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-[var(--au-rule)] border-b text-[var(--au-muted)] text-xs uppercase tracking-wide">
                                <th className="px-3 py-2 font-medium">Date</th>
                                <th className="px-3 py-2 font-medium">Kind</th>
                                <th className="px-3 py-2 font-medium">Claim</th>
                                <th className="px-3 py-2 font-medium">
                                    Status
                                </th>
                                <th className="px-3 py-2 font-medium">
                                    Verdict
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((run) => (
                                <tr
                                    key={run.id}
                                    className="border-[var(--au-rule)] border-b last:border-b-0"
                                >
                                    <td className="px-3 py-2 text-[var(--au-muted)] font-[family-name:var(--font-mono)] text-xs">
                                        <Link
                                            href={`/runs/${run.id}`}
                                            className="block hover:text-[var(--au-ink)]"
                                        >
                                            {formatDate(run.createdAt)}
                                        </Link>
                                    </td>
                                    <td className="px-3 py-2">
                                        <Link
                                            href={`/runs/${run.id}`}
                                            className="block text-[var(--au-ink)]"
                                        >
                                            {run.kind}
                                        </Link>
                                    </td>
                                    <td className="max-w-xs px-3 py-2">
                                        <Link
                                            href={`/runs/${run.id}`}
                                            className="block truncate text-[var(--au-ink)]"
                                            title={run.claim ?? undefined}
                                        >
                                            {run.claim ?? "—"}
                                        </Link>
                                    </td>
                                    <td className="px-3 py-2">
                                        <Link
                                            href={`/runs/${run.id}`}
                                            className={`block font-medium ${STATUS_COLOR[run.status]}`}
                                        >
                                            {run.status}
                                        </Link>
                                    </td>
                                    <td className="px-3 py-2">
                                        <Link
                                            href={`/runs/${run.id}`}
                                            className="block font-[family-name:var(--font-mono)] text-[var(--au-muted)] text-xs"
                                        >
                                            {run.verdict
                                                ? `${run.verdict.confidence} · ${run.verdict.score}`
                                                : "—"}
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
