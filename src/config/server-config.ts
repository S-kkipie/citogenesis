import { env } from "@/config/env";

export const ServerConfig = {
    databaseURL: env.DATABASE_URL,
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    geminiApiKey: env.GEMINI_API_KEY,
    openAlexMailto: env.OPENALEX_MAILTO,
    info: {
        name: "Citogenesis API",
        version: "1.0.0",
        description:
            "Citation provenance auditor — traces claims to primary evidence",
    },
    /** Single sanctioned read of the Node built-in. */
    isProduction: process.env.NODE_ENV === "production",
    isDevelopment: process.env.NODE_ENV === "development",
} as const;
