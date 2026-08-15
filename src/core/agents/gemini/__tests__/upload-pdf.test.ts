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
        const { d, upload } = deps(html);
        expect(await uploadPdf("http://x/landing", d as never)).toBeNull();
        expect(upload).not.toHaveBeenCalled();
    });

    it("returns null when fetch throws", async () => {
        const { d } = deps(new Error("network"));
        expect(await uploadPdf("http://x/y.pdf", d as never)).toBeNull();
    });

    it("returns null for a blank/whitespace url without fetching", async () => {
        const { d, upload } = deps(pdfResponse);
        expect(await uploadPdf("   ", d as never)).toBeNull();
        expect(d.fetch).not.toHaveBeenCalled();
        expect(upload).not.toHaveBeenCalled();
    });

    it("returns null for a non-PDF content-type even when the url ends in .pdf", async () => {
        const html = {
            headers: new Headers({ "content-type": "text/html" }),
            blob: async () => new Blob(),
        } as unknown as Response;
        const { d, upload } = deps(html);
        expect(await uploadPdf("http://x/paper.pdf", d as never)).toBeNull();
        expect(upload).not.toHaveBeenCalled();
    });

    it("falls back to the .pdf suffix when content-type is absent", async () => {
        const noType = {
            headers: new Headers({ "content-length": "1000" }),
            blob: async () =>
                new Blob([new Uint8Array(1000)], { type: "application/pdf" }),
        } as unknown as Response;
        const { d, upload } = deps(noType);
        const part = await uploadPdf("http://x/y.pdf", d as never);
        expect(upload).toHaveBeenCalledOnce();
        expect(part).toMatchObject({ fileData: { fileUri: "files/x" } });
    });

    it("returns null when content-length exceeds 20MB", async () => {
        const oversize = {
            headers: new Headers({
                "content-type": "application/pdf",
                "content-length": String(20 * 1024 * 1024 + 1),
            }),
            blob: async () =>
                new Blob([new Uint8Array(1)], { type: "application/pdf" }),
        } as unknown as Response;
        const { d, upload } = deps(oversize);
        expect(await uploadPdf("http://x/y.pdf", d as never)).toBeNull();
        expect(upload).not.toHaveBeenCalled();
    });
});
