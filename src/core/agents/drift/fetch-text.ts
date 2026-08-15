import type { Part } from "@google/genai";
import { uploadPdf } from "@/core/agents/gemini/upload-pdf";
import type { CitationNode } from "@/core/run/domain";

export type UploadFn = typeof uploadPdf;

export type OriginContent =
    | { part: Part; basis: "fulltext" }
    | { text: string; basis: "abstract" }
    | null;

/** Prefer OA full text (PDF → Gemini File API); fall back to the abstract;
 * null when neither is available (caller skips this origin). */
export async function resolveOriginContent(
    node: CitationNode,
    upload: UploadFn = uploadPdf,
): Promise<OriginContent> {
    if (node.oaUrl) {
        const part = await upload(node.oaUrl);
        if (part) return { part, basis: "fulltext" };
    }

    if (node.abstract) return { text: node.abstract, basis: "abstract" };

    return null;
}
