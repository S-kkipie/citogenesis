import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { serverTiming } from "@elysiajs/server-timing";
import { elysiaLogger } from "@logtape/elysia";
import { getLogger } from "@logtape/logtape";
import { Elysia } from "elysia";
import { z } from "zod";
import { ServerConfig } from "@/config/server-config";
import type { APIResponse } from "./common/responses";

const apiErrorLogger = getLogger(["server", "error"]);

// OpenAPI (Scalar UI at /api/v1/openapi) is dev-only.
const docs = new Elysia({ name: "docs" });
if (ServerConfig.isDevelopment) {
    docs.use(
        openapi({
            documentation: {
                info: {
                    title: ServerConfig.info.name,
                    version: ServerConfig.info.version,
                    description: ServerConfig.info.description,
                },
            },
            mapJsonSchema: { zod: z.toJSONSchema },
        }),
    );
}

const app = new Elysia({ prefix: "/api/v1" })
    .use(
        cors({
            origin: [ServerConfig.baseUrl],
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            credentials: true,
            allowedHeaders: ["Content-Type", "Authorization"],
        }),
    )
    .use(docs)
    .use(serverTiming())
    .use(elysiaLogger())
    .onError(({ error, code, set, request, path }) => {
        const isValidation = code === "VALIDATION";
        if (!isValidation) {
            apiErrorLogger.error(
                "Unhandled API error {code} on {method} {path}: {error}",
                {
                    code,
                    method: request.method,
                    path,
                    error:
                        error instanceof Error
                            ? (error.stack ?? error.message)
                            : String(error),
                },
            );
        }
        set.status = isValidation ? 400 : 500;
        return {
            code: isValidation ? "VALIDATION" : "INTERNAL_SERVER_ERROR",
            status: isValidation ? 400 : 500,
        } satisfies APIResponse;
    });
// The runs router (src/core/run/server) plugs in here once contracts land.

export default app;
export type AppRouter = typeof app;
