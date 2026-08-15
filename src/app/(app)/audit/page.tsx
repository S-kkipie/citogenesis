"use client";

import { InputBar } from "./_components/InputBar";
import { RunDashboard } from "./_components/RunDashboard";
import { useRunStream } from "./_hooks/useRunStream";

export default function AuditPage() {
    const { live, state, start, status } = useRunStream();

    return (
        <div className="flex flex-col">
            <InputBar onRun={start} disabled={status === "running"} />
            <RunDashboard state={state} live={live ?? undefined} mode="live" />
        </div>
    );
}
