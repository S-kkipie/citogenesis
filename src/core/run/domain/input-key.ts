import type { RunInput } from "./state";

/**
 * Canonical dedupe key for a run input. Two inputs with the same key are
 * the same audit: claims and paper ids compare case- and
 * whitespace-insensitively; Wikipedia URLs keep their path case (article
 * titles are case-sensitive) and include the statement when present.
 */
export function inputKey(input: RunInput): string {
    switch (input.kind) {
        case "claim":
            return `claim:${input.text.trim().toLowerCase()}`;
        case "paper":
            return `paper:${input.id.trim().toLowerCase()}`;
        case "wikipedia": {
            const statement = input.statement?.trim().toLowerCase();
            return `wikipedia:${input.url.trim()}${statement ? `|${statement}` : ""}`;
        }
    }
}
