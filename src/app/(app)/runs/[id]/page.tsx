import { notFound } from "next/navigation";
import { sampleRecord } from "@/core/run/client/fixtures/sample-run";
import { type RunRecord, runRecordSchema } from "@/core/run/domain";
import { RunDashboard } from "../../audit/_components/RunDashboard";

/**
 * Shareable, read-only permalink for a completed run. `sample-run` is a
 * fixed demo id that renders a bundled fixture (no DB round-trip, no env
 * access); any other id is fetched from the API via a plain `fetch` (not
 * the Eden treaty client — that module evaluates `createEdenTanStackQuery`
 * at module scope, which needs a React context the RSC server runtime
 * doesn't provide) and 404s if it doesn't resolve to a persisted run.
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

    // Import env-dependent config lazily so the sample path stays env-free.
    const { ClientConfig } = await import("@/config/client-config");

    let record: RunRecord | null = null;
    try {
        const res = await fetch(`${ClientConfig.baseUrl}/api/v1/runs/${id}`, {
            cache: "no-store",
        });
        if (res.ok) {
            record = runRecordSchema.parse(await res.json());
        }
    } catch {
        record = null;
    }

    if (!record) notFound();
    return <RunDashboard state={record.state} mode="replay" />;
}
