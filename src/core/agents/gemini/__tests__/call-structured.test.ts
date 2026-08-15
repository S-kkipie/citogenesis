import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentSchemaError } from "../errors";

// `call-structured.ts` imports the Gemini client singleton, which reads
// `ServerConfig` (validated env) at module-load time. The shared vitest env
// block only sets DATABASE_URL/BETTER_AUTH_SECRET/NEXT_PUBLIC_APP_URL — no
// existing test previously imported far enough to need GEMINI_API_KEY or
// OPENALEX_MAILTO. Stub throwaway values before the dynamic import below;
// every test here injects a fake `ai` via `deps`, so `getGenAI()` is never
// actually called and the real key is never touched.
process.env.GEMINI_API_KEY ??= "test-gemini-api-key";
process.env.OPENALEX_MAILTO ??= "test@example.com";

const { callStructured } = await import("../call-structured");

const schema = z.object({ ok: z.boolean() });
const emit = () => {};

/** Build a fake `ai` whose generateContent returns the queued texts in order. */
function fakeAI(texts: string[]) {
    const generateContent = vi.fn(async () => {
        const text = texts.shift();
        return {
            text,
            usageMetadata: {
                promptTokenCount: 1,
                candidatesTokenCount: 2,
                totalTokenCount: 3,
            },
        };
    });
    return { deps: { ai: { models: { generateContent } } }, generateContent };
}

const base = {
    model: "m",
    contents: "hi",
    schema,
    agent: "verdict" as const,
    emit,
    label: "t",
};

describe("callStructured", () => {
    it("parses and validates a good response", async () => {
        const { deps } = fakeAI(['{"ok":true}']);
        const { data, usage } = await callStructured(base, deps);
        expect(data).toEqual({ ok: true });
        expect(usage.total).toBe(3);
    });

    it("retries once on invalid JSON, then succeeds", async () => {
        const { deps, generateContent } = fakeAI(["not json", '{"ok":false}']);
        const { data } = await callStructured(base, deps);
        expect(data).toEqual({ ok: false });
        expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it("throws AgentSchemaError after two failures", async () => {
        const { deps } = fakeAI(["nope", "still nope"]);
        await expect(callStructured(base, deps)).rejects.toBeInstanceOf(
            AgentSchemaError,
        );
    });
});
