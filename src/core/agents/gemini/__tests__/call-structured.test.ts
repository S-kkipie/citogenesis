import type { ContentListUnion } from "@google/genai";
import { createUserContent } from "@google/genai";
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

/** Build a fake `ai` whose generateContent returns the queued texts in order.
 * Typing the (unused) request param lets tests inspect `mock.calls[n][0]`. */
function fakeAI(texts: string[]) {
    const generateContent = vi.fn(
        async (_req: { contents: ContentListUnion }) => {
            const text = texts.shift();
            return {
                text,
                usageMetadata: {
                    promptTokenCount: 1,
                    candidatesTokenCount: 2,
                    totalTokenCount: 3,
                },
            };
        },
    );
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

    // DriftAuditor (unlike PrimacyJudge/WriteVerdict) passes object `contents`
    // built by `createUserContent`, which can carry a non-text part (e.g. a
    // PDF file part). The retry used to rebuild the prior turn as
    // `{ text: String(contents) }`, which stringifies an object to the
    // literal "[object Object]" — silently dropping the claim + PDF from the
    // schema-repair turn. This drives the real `callStructured` (not a fake
    // `call`) through the injected `ai` seam to prove the original object
    // content survives into the retry's first turn.
    it("preserves object contents (createUserContent, incl. a non-text part) on the schema-repair retry", async () => {
        const { deps, generateContent } = fakeAI(["not json", '{"ok":true}']);
        const contents = createUserContent(["prompt", { text: "origin body" }]);

        const { data } = await callStructured({ ...base, contents }, deps);

        expect(data).toEqual({ ok: true });
        expect(generateContent).toHaveBeenCalledTimes(2);

        const secondCallReq = generateContent.mock.calls[1]?.[0];
        const sentContents = secondCallReq?.contents as Array<{
            role?: string;
            parts?: Array<{ text?: string }>;
        }>;

        // Not the collapsed "[object Object]" string, and not the string
        // 'hi' from `base` either — the ORIGINAL object, unchanged.
        expect(JSON.stringify(sentContents)).not.toContain("[object Object]");
        expect(sentContents[0]).toEqual(contents);
        expect(sentContents[0].parts?.[0]?.text).toBe("prompt");
        expect(sentContents[0].parts?.[1]?.text).toBe("origin body");
    });
});
