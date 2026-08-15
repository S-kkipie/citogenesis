import { createUserContent } from "@google/genai";
import { resolveOriginContent } from "@/core/agents/drift/fetch-text";
import {
    buildDriftPrompt,
    DRIFT_SYSTEM,
    driftAnswerSchema,
} from "@/core/agents/drift/prompt";
import { callStructured } from "@/core/agents/gemini/call-structured";
import { BENCH_CASES } from "./fixtures/claims";

export interface BenchRow {
    model: string;
    claim: string;
    label: string;
    basis: string;
    latencyMs: number;
    totalTokens: number;
}

const DEFAULT_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.1-pro",
];

const noEmit = () => {};

/** Runs the DriftAuditor path (fetch origin content → structured LLM call)
 * for every fixed claim x model combination. Makes LIVE Gemini calls — run
 * manually via the CLI entry below, never in CI. */
export async function runBenchmark(
    models: string[] = DEFAULT_MODELS,
): Promise<BenchRow[]> {
    const rows: BenchRow[] = [];
    for (const model of models) {
        for (const { claim, origin } of BENCH_CASES) {
            const content = await resolveOriginContent(origin);
            if (!content) {
                rows.push({
                    model,
                    claim,
                    label: "NO_CONTENT",
                    basis: "none",
                    latencyMs: 0,
                    totalTokens: 0,
                });
                continue;
            }
            const contents =
                "part" in content
                    ? createUserContent([
                          buildDriftPrompt(claim, origin),
                          content.part,
                      ])
                    : createUserContent([
                          `${buildDriftPrompt(claim, origin)}\n\n${content.text}`,
                      ]);
            const { data, usage, latencyMs } = await callStructured({
                model,
                system: DRIFT_SYSTEM,
                contents,
                schema: driftAnswerSchema,
                agent: "drift-auditor",
                emit: noEmit,
                label: `bench ${model}`,
            });
            rows.push({
                model,
                claim: claim.slice(0, 40),
                label: data.label,
                basis: content.basis,
                latencyMs,
                totalTokens: usage.total,
            });
        }
    }
    return rows;
}

// Manual entry: `pnpm tsx --env-file=.env src/core/agents/drift/benchmark/bench.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
    runBenchmark()
        .then((rows) => {
            console.table(rows);
        })
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
