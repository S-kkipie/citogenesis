import { createPartFromUri, type GoogleGenAI, type Part } from "@google/genai";
import { getGenAI } from "./client";

export type UploadDeps = {
    ai: Pick<GoogleGenAI, "files">;
    fetch: typeof fetch;
};
const MAX_BYTES = 20 * 1024 * 1024;

/** Content-types that carry no real signal about the payload — a `.pdf` URL
 * suffix is trusted as a fallback only when the server sent one of these
 * (or omitted content-type entirely). Any other explicit content-type wins
 * over the suffix. */
const GENERIC_CONTENT_TYPES = new Set(["", "application/octet-stream"]);

/** Fetch a PDF from `url` and upload it via the Files API. Returns a file part,
 * or null when the URL is not a usable PDF (caller falls back to the abstract). */
export async function uploadPdf(
    url: string,
    deps: UploadDeps = { ai: getGenAI(), fetch },
): Promise<Part | null> {
    if (typeof url !== "string" || !url.trim()) return null;
    try {
        const res = await deps.fetch(url);
        const type = (res.headers.get("content-type") ?? "")
            .split(";")[0]
            .trim()
            .toLowerCase();
        const len = Number(res.headers.get("content-length") ?? "0");
        const hasSuffix = url.toLowerCase().endsWith(".pdf");
        const looksPdf =
            type === "application/pdf" ||
            (GENERIC_CONTENT_TYPES.has(type) && hasSuffix);
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
