import { describe, expect, it, vi } from "vitest";

// `upload-pdf.ts` imports the Gemini client singleton (via its default deps),
// which reads `ServerConfig` (validated env) at module-load time. The shared
// vitest env block only sets DATABASE_URL/BETTER_AUTH_SECRET/NEXT_PUBLIC_APP_URL
// — no existing test previously imported far enough to need GEMINI_API_KEY or
// OPENALEX_MAILTO. Stub throwaway values before the dynamic import below;
// every test here injects a fake `ai`/`fetch` via `deps`, so `getGenAI()` is
// never actually called and the real key is never touched.
process.env.GEMINI_API_KEY ??= "test-gemini-api-key";
process.env.OPENALEX_MAILTO ??= "test@example.com";

const { uploadPdf } = await import("../upload-pdf");

function deps(
    res: Partial<Response> | Error,
    uploaded = { uri: "files/x", mimeType: "application/pdf" },
) {
    const fetch = vi.fn(async () => {
        if (res instanceof Error) throw res;
        return res as Response;
    });
    const upload = vi.fn(async () => uploaded);
    return { d: { ai: { files: { upload } }, fetch }, upload };
}

const pdfResponse = {
    headers: new Headers({
        "content-type": "application/pdf",
        "content-length": "1000",
    }),
    blob: async () =>
        new Blob([new Uint8Array(1000)], { type: "application/pdf" }),
} as unknown as Response;

describe("uploadPdf", () => {
    it("uploads a PDF and returns a file part", async () => {
        const { d, upload } = deps(pdfResponse);
        const part = await uploadPdf("http://x/y.pdf", d as never);
        expect(upload).toHaveBeenCalledOnce();
        expect(part).toMatchObject({ fileData: { fileUri: "files/x" } });
    });

    it("returns null for a non-PDF content-type", async () => {
        const html = {
            headers: new Headers({ "content-type": "text/html" }),
            blob: async () => new Blob(),
        } as unknown as Response;
        const { d } = deps(html);
        expect(await uploadPdf("http://x/landing", d as never)).toBeNull();
    });

    it("returns null when fetch throws", async () => {
        const { d } = deps(new Error("network"));
        expect(await uploadPdf("http://x/y.pdf", d as never)).toBeNull();
    });
});
