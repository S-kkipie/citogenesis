import { z } from "zod";

/** Gemini `responseJsonSchema` accepts a JSON Schema but rejects the `$schema`
 * meta key. Convert a Zod schema and strip it. */
export function toGeminiSchema(schema: z.ZodType): unknown {
    const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<
        string,
        unknown
    >;
    delete json.$schema;
    return json;
}
