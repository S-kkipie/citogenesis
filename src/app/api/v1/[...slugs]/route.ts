import app from "@/server/router";

/** A run holds the SSE response open for the whole pipeline (BFS +
 * LLM calls) — give it the full window the plan allows. */
export const maxDuration = 300;

export const GET = app.fetch;
export const POST = app.fetch;
export const PUT = app.fetch;
export const PATCH = app.fetch;
export const DELETE = app.fetch;
export const OPTIONS = app.fetch;
