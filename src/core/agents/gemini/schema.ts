import { z } from "zod";

/** Keys `z.toJSONSchema` emits that Gemini's `responseJsonSchema` doesn't
 * accept (or doesn't need): the JSON-Schema meta key, the `additionalProperties:
 * false` every object gets, `pattern` (from regex-validated strings like
 * `workIdSchema`), and `format`. Dropped recursively, at every depth. */
const DROPPED_KEYS = new Set([
    "$schema",
    "additionalProperties",
    "pattern",
    "format",
]);

type JsonObject = Record<string, unknown>;

const isPlainObject = (v: unknown): v is JsonObject =>
    typeof v === "object" && v !== null && !Array.isArray(v);

/** `anyOf: [{...}, {type:"null"}]` (Zod's draft-7 shape for `.nullable()`)
 * with exactly one non-null branch — return that branch, unsanitized. */
function nullableBranch(anyOf: unknown): JsonObject | undefined {
    if (!Array.isArray(anyOf) || anyOf.length !== 2) return undefined;
    const branches = anyOf as unknown[];
    const nullIdx = branches.findIndex(
        (b) => isPlainObject(b) && b.type === "null",
    );
    if (nullIdx === -1) return undefined;
    const nonNull = branches[1 - nullIdx];
    return isPlainObject(nonNull) ? nonNull : undefined;
}

/** Recursively sanitize a JSON Schema (as emitted by `z.toJSONSchema`) for
 * Gemini's `responseJsonSchema`: drop unsupported keys at every depth, and
 * rewrite a nullable union into Gemini's `nullable: true` flag. Pure. */
function sanitize(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(sanitize);
    if (!isPlainObject(node)) return node;

    const nonNull = "anyOf" in node ? nullableBranch(node.anyOf) : undefined;
    if (nonNull) {
        const merged: JsonObject = { ...(sanitize(nonNull) as JsonObject) };
        for (const [key, value] of Object.entries(node)) {
            if (key === "anyOf" || DROPPED_KEYS.has(key)) continue;
            merged[key] = sanitize(value);
        }
        merged.nullable = true;
        return merged;
    }

    const result: JsonObject = {};
    for (const [key, value] of Object.entries(node)) {
        if (DROPPED_KEYS.has(key)) continue;
        result[key] = sanitize(value);
    }
    return result;
}

/** Convert a Zod schema to a JSON Schema Gemini's `responseJsonSchema` will
 * accept. `z.toJSONSchema` emits `$schema`, `additionalProperties: false`,
 * `pattern`, and nullable-as-`anyOf` — Gemini rejects some of these keys
 * outright (a live 400 on every call) and doesn't understand others. Our own
 * `schema.parse` still validates strictly on the app side, so loosening the
 * schema we hand to Gemini is safe. */
export function toGeminiSchema(schema: z.ZodType): unknown {
    const json = z.toJSONSchema(schema, { target: "draft-7" });
    return sanitize(json);
}
