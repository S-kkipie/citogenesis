import { notFound } from "next/navigation";
import { sampleRecord } from "@/core/run/client/fixtures/sample-run";
import { apiClient } from "@/frontend/lib/eden";
import { RunDashboard } from "../../audit/_components/RunDashboard";

/**
 * Shareable, read-only permalink for a completed run. `sample-run` is a
 * fixed demo id that renders a bundled fixture (no DB round-trip); any
 * other id is fetched from the API and 404s if it doesn't resolve to a
 * persisted run with state.
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

    const res = await apiClient.api.v1.runs({ id }).get();
    const record = res.data;
    if (res.error || !record?.state) notFound();

    return <RunDashboard state={record.state} mode="replay" />;
}
