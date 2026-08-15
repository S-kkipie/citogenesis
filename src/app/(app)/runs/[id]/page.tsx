import { notFound } from "next/navigation";
import { sampleRecord } from "@/core/run/client/fixtures/sample-run";
import type { RunState } from "@/core/run/domain";
import { RunDashboard } from "../../audit/_components/RunDashboard";

/**
 * Shareable, read-only permalink for a completed run. `sample-run` is a
 * fixed demo id that renders a bundled fixture (no DB round-trip, no env
 * access); any other id is read straight from Postgres — this is a server
 * component, so going back out over HTTP to our own API would only add a
 * round trip and a base-URL to get wrong. 404s when the id doesn't resolve.
 */
export default async function RunPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    if (id === "sample-run") {
        return <RunDashboard state={sampleRecord.state} mode="replay" />;
    }

    // Imported lazily so the sample path needs no database and no env.
    const [{ eq }, { db }, { runs }] = await Promise.all([
        import("drizzle-orm"),
        import("@/server/drizzle/db"),
        import("@/server/drizzle/schemas"),
    ]);

    let state: RunState | null = null;
    try {
        const [row] = await db
            .select({ state: runs.state })
            .from(runs)
            .where(eq(runs.id, id))
            .limit(1);
        state = row?.state ?? null;
    } catch {
        state = null;
    }

    if (!state) notFound();
    return <RunDashboard state={state} mode="replay" />;
}
