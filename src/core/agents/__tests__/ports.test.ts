import { describe, expect, it } from "vitest";
import type { AuditDrift, JudgePrimacy, WriteVerdict } from "@/core/run/domain";

// `index.ts` imports all agents, which import `callStructured`, which in turn reads
// `ServerConfig` (validated env) at module-load time. The shared vitest env block
// only sets DATABASE_URL/BETTER_AUTH_SECRET/NEXT_PUBLIC_APP_URL — no existing test
// previously imported far enough to need GEMINI_API_KEY or OPENALEX_MAILTO. Stub
// throwaway values before the dynamic import below so module evaluation can’t fail.
process.env.GEMINI_API_KEY ??= "test-gemini-api-key";
process.env.OPENALEX_MAILTO ??= "test@example.com";

const { auditDrift, judgePrimacy, writeVerdict } = await import("../index");

describe("agents barrel", () => {
    it("exports the three port implementations", () => {
        // Type-level conformance: assignment fails to compile if signatures drift.
        const a: JudgePrimacy = judgePrimacy;
        const b: AuditDrift = auditDrift;
        const c: WriteVerdict = writeVerdict;
        expect([a, b, c].every((f) => typeof f === "function")).toBe(true);
    });
});
