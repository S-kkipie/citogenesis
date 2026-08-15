import type { ContentListUnion, GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import type { AgentName, TraceEmit } from "@/core/run/domain";
import { getGenAI } from "./client";
import { AgentSchemaError } from "./errors";
import { toGeminiSchema } from "./schema";

type GenerateContentRequest = Parameters<
    GoogleGenAI["models"]["generateContent"]
>[0];

// Brief specifies `Pick<GoogleGenAI, "models">`, but that still requires the
// full `Models` class shape for `ai.models` (Pick doesn't recurse) — and even
// narrowed to `generateContent` alone, the real SDK method returns the full
// `GenerateContentResponse` class, which `tsc --noEmit` won't unify with the
// test's plain-object fake. `callStructured` only ever reads `.text` and
// `.usageMetadata`, so declare the dependency shape as just that: the real
// `GoogleGenAI` instance satisfies it (a wider return type is assignable to
// this narrower one), and the test's fake `ai.models.generateContent` does
// too, with no `as`/`any` casts on either side.
export type CallDeps = {
    ai: {
        models: {
            generateContent(req: GenerateContentRequest): Promise<{
                text?: string;
                usageMetadata?: {
                    promptTokenCount?: number;
                    candidatesTokenCount?: number;
                    totalTokenCount?: number;
                };
            }>;
        };
    };
};

export interface CallStructuredOpts<T> {
    model: string;
    system?: string;
    contents: ContentListUnion;
    schema: z.ZodType<T>;
    agent: AgentName;
    emit: TraceEmit;
    label: string;
}

export interface CallResult<T> {
    data: T;
    usage: { prompt: number; output: number; total: number };
    latencyMs: number;
}

const isTransient = (e: unknown) => {
    const s = (e as { status?: number })?.status ?? 0;
    return s === 429 || (s >= 500 && s < 600);
};

async function generateWithBackoff(
    ai: CallDeps["ai"],
    req: GenerateContentRequest,
) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await ai.models.generateContent(req);
        } catch (e) {
            lastErr = e;
            if (!isTransient(e)) throw e;
            await new Promise((r) => setTimeout(r, 2 ** attempt * 250));
        }
    }
    throw lastErr;
}

export async function callStructured<T>(
    opts: CallStructuredOpts<T>,
    deps: CallDeps = { ai: getGenAI() },
): Promise<CallResult<T>> {
    const { model, system, contents, schema, agent, emit, label } = opts;
    const started = performance.now();
    emit({ agent, phase: "start", summary: label, data: { model } });

    const config = {
        ...(system ? { systemInstruction: system } : {}),
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiSchema(schema),
    };

    let contentsToSend: ContentListUnion = contents;
    let lastError = "";

    for (let attempt = 0; attempt < 2; attempt++) {
        const res = await generateWithBackoff(deps.ai, {
            model,
            contents: contentsToSend,
            config,
        });
        const raw = res.text ?? "";
        try {
            const data = schema.parse(JSON.parse(raw));
            const u = res.usageMetadata;
            emit({ agent, phase: "done", summary: label });
            return {
                data,
                usage: {
                    prompt: u?.promptTokenCount ?? 0,
                    output: u?.candidatesTokenCount ?? 0,
                    total: u?.totalTokenCount ?? 0,
                },
                latencyMs: Math.round(performance.now() - started),
            };
        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
            if (attempt === 0) {
                emit({
                    agent,
                    phase: "recovery",
                    summary: `${label}: schema retry`,
                    data: { lastError },
                });
                contentsToSend = [
                    { role: "user", parts: [{ text: String(contents) }] },
                    { role: "model", parts: [{ text: raw }] },
                    {
                        role: "user",
                        parts: [
                            {
                                text: `Your previous output failed validation: ${lastError}. Return corrected JSON only, matching the schema.`,
                            },
                        ],
                    },
                ];
            }
        }
    }
    emit({
        agent,
        phase: "error",
        summary: `${label}: schema failed`,
        data: { lastError },
    });
    throw new AgentSchemaError(agent, lastError);
}
