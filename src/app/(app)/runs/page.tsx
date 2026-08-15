import Link from "next/link";
import type { RunStatus } from "@/core/run/domain";

/**
 * Server component: reads the last 50 runs directly from Postgres (same
 * narrowed query used by GET /api/v1/runs, via the shared `listRuns`
 * helper) rather than fetching our own API — see `[id]/page.tsx` for why.
 * The helper is imported lazily so this module needs no env access until
 * the page actually renders.
 */

/** Always render fresh — a statically-baked history list would never update. */
export const dynamic = "force-dynamic";

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
    const { listRuns } = await import("@/core/run/server/list-runs");

    let history: Awaited<ReturnType<typeof listRuns>> = [];
    let loadFailed = false;
    try {
        history = await listRuns();
    } catch {
        loadFailed = true;
    }

    return (
        <div className="p-6">
            <h1 className="font-[family-name:var(--font-display)] font-semibold text-[var(--au-ink)] text-lg">
                Run history
            </h1>

            {loadFailed ? (
                <p className="mt-16 text-center text-[var(--au-muted)] text-sm">
                    Could not load run history.
                </p>
            ) : history.length === 0 ? (
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
