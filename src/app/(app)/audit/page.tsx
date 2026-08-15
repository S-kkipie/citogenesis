"use client";

import { sampleRecord } from "@/core/run/client/fixtures/sample-run";
import { RunDashboard } from "./_components/RunDashboard";

export default function AuditPage() {
    return <RunDashboard state={sampleRecord.state} mode="replay" />;
}
