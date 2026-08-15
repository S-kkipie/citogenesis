"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { PropsWithChildren } from "react";
import { Toaster } from "@/frontend/components/ui/sonner";
import { apiClient, EdenProvider } from "@/frontend/lib/eden";
import { getQueryClient } from "@/frontend/lib/query-client";
import { ThemeProvider } from "./theme-provider";

export function Providers({ children }: PropsWithChildren) {
    const queryClient = getQueryClient();

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <NuqsAdapter>
                <QueryClientProvider client={queryClient}>
                    <EdenProvider client={apiClient} queryClient={queryClient}>
                        {children}
                        <Toaster />
                    </EdenProvider>
                </QueryClientProvider>
            </NuqsAdapter>
        </ThemeProvider>
    );
}
