import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toGeminiSchema } from "../schema";

// Mirrors real domain usage: `workIdSchema = z.string().regex(/^W\d+$/)`
// (src/core/run/domain/graph.ts) is exactly the kind of regex-validated
// string field that made `z.toJSONSchema` emit a `pattern` Gemini rejects.
const workIdLike = z.string().regex(/^W\d+$/);

describe("toGeminiSchema", () => {
    it("drops $schema, additionalProperties, pattern, and format at every depth", () => {
        const schema = z.object({
            id: workIdLike,
            email: z.string().email(),
            nested: z.object({
                ref: workIdLike,
                items: z.array(z.object({ ref: workIdLike })),
            }),
        });
        const flat = JSON.stringify(toGeminiSchema(schema));
        expect(flat).not.toContain("$schema");
        expect(flat).not.toContain("additionalProperties");
        expect(flat).not.toContain("pattern");
        expect(flat).not.toContain("format");
    });

    it("rewrites a nullable field into `nullable: true` with no anyOf, keeping the description", () => {
        const schema = z.object({
            note: z.string().nullable().describe("optional note"),
        });
        const out = toGeminiSchema(schema) as {
            properties: { note: Record<string, unknown> };
        };
        expect(out.properties.note).toEqual({
            type: "string",
            nullable: true,
            description: "optional note",
        });
        expect(out.properties.note.anyOf).toBeUndefined();
    });

    it("rewrites a nullable integer field too", () => {
        const schema = z.object({ year: z.number().int().nullable() });
        const out = toGeminiSchema(schema) as {
            properties: { year: Record<string, unknown> };
        };
        expect(out.properties.year.type).toBe("integer");
        expect(out.properties.year.nullable).toBe(true);
        expect(out.properties.year.anyOf).toBeUndefined();
    });

    it("preserves normal fields and enums untouched", () => {
        const schema = z.object({
            label: z.enum(["primary", "secondary", "unknown"]),
            title: z.string(),
        });
        const out = toGeminiSchema(schema) as {
            properties: { label: unknown; title: unknown };
        };
        expect(out.properties.label).toEqual({
            type: "string",
            enum: ["primary", "secondary", "unknown"],
        });
        expect(out.properties.title).toEqual({ type: "string" });
    });

    it("recurses through nested objects and arrays, dropping keys at every depth", () => {
        const schema = z.object({
            id: workIdLike,
            nested: z.object({ ref: workIdLike }),
            list: z.array(z.object({ ref: workIdLike })),
        });
        const out = toGeminiSchema(schema) as {
            additionalProperties?: unknown;
            properties: {
                id: { pattern?: unknown };
                nested: {
                    additionalProperties?: unknown;
                    properties: { ref: { pattern?: unknown } };
                };
                list: {
                    items: {
                        additionalProperties?: unknown;
                        properties: { ref: { pattern?: unknown } };
                    };
                };
            };
        };
        expect(out.additionalProperties).toBeUndefined();
        expect(out.properties.id.pattern).toBeUndefined();
        expect(out.properties.nested.additionalProperties).toBeUndefined();
        expect(out.properties.nested.properties.ref.pattern).toBeUndefined();
        expect(out.properties.list.items.additionalProperties).toBeUndefined();
        expect(
            out.properties.list.items.properties.ref.pattern,
        ).toBeUndefined();
    });
});
