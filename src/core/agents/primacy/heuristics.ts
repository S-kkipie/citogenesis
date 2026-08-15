import type { Primacy } from "@/core/run/domain";

const SECONDARY = new Set([
    "review",
    "editorial",
    "letter",
    "erratum",
    "paratext",
    "book-review",
    "book",
    "report",
]);
const PRIMARY = new Set(["dataset"]);

/** Confidently route by OpenAlex `type`. Returns null for ambiguous types
 * (`article`, `preprint`, unknown) — those go to the LLM. */
export function heuristicPrimacy(type: string): Primacy | null {
    if (SECONDARY.has(type))
        return {
            label: "secondary",
            method: "heuristic",
            rationale: `OpenAlex type '${type}' is a secondary source`,
        };
    if (PRIMARY.has(type))
        return {
            label: "primary",
            method: "heuristic",
            rationale: `OpenAlex type '${type}' is original data`,
        };
    return null;
}
