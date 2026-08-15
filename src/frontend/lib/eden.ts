import { treaty } from "@elysiajs/eden";
import { createEdenTanStackQuery } from "eden-tanstack-react-query";
import { ClientConfig } from "@/config/client-config";
import type { AppRouter } from "@/server/router";

/**
 * In the browser the API is always same-origin, so use the live origin
 * rather than the configured URL — that keeps requests working on any dev
 * port and on Vercel preview domains, where NEXT_PUBLIC_APP_URL can lag
 * behind the URL the page is actually served from. On the server (SSR/RSC)
 * there is no origin, so fall back to the configured base URL.
 */
const BASE_URL =
    typeof window === "undefined"
        ? ClientConfig.baseUrl
        : window.location.origin;

const { EdenProvider, useEden } = createEdenTanStackQuery<AppRouter>();
/** Typed options proxy rooted at /api/v1. Bind one domain, then hang calls off it. */
const useElysia = () => useEden().api.v1;

const apiClient = treaty<AppRouter>(BASE_URL);

export { apiClient, EdenProvider, useElysia };
