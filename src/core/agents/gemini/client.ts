import { GoogleGenAI } from "@google/genai";
import { ServerConfig } from "@/config/server-config";

let cached: GoogleGenAI | undefined;

/** Memoized GoogleGenAI singleton keyed off the server config. */
export function getGenAI(): GoogleGenAI {
    if (!cached)
        cached = new GoogleGenAI({ apiKey: ServerConfig.geminiApiKey });
    return cached;
}

export const MODELS = {
    primacy: "gemini-3.5-flash-lite",
    drift: "gemini-3.6-flash",
    verdict: "gemini-3.6-flash",
    driftFallback: "gemini-3.1-pro",
} as const;
