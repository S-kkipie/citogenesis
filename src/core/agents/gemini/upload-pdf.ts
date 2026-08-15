import { createPartFromUri, type GoogleGenAI, type Part } from "@google/genai";
import { getGenAI } from "./client";

export type UploadDeps = {
    ai: Pick<GoogleGenAI, "files">;
    fetch: typeof fetch;
};
const MAX_BYTES = 20 * 1024 * 1024;

/** Fetch a PDF from `url` and upload it via the Files API. Returns a file part,
 * or null when the URL is not a usable PDF (caller falls back to the abstract). */
export async function uploadPdf(
    url: string,
    deps: UploadDeps = { ai: getGenAI(), fetch },
): Promise<Part | null> {
    try {
        const res = await deps.fetch(url);
        const type = res.headers.get("content-type") ?? "";
        const len = Number(res.headers.get("content-length") ?? "0");
        const looksPdf =
            type.includes("application/pdf") ||
            url.toLowerCase().endsWith(".pdf");
        if (!looksPdf || len > MAX_BYTES) return null;
        const blob = await res.blob();
        if (blob.size > MAX_BYTES) return null;
        const file = await deps.ai.files.upload({
            file: blob,
            config: { mimeType: "application/pdf" },
        });
        if (!file.uri) return null;
        return createPartFromUri(file.uri, file.mimeType ?? "application/pdf");
    } catch {
        return null;
    }
}
