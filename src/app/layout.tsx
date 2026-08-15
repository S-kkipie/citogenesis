import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import { Providers } from "@/frontend/providers/providers";
import { fontBody, fontDisplay, fontMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
    title: "Citogenesis",
    description:
        "Multi-agent citation provenance auditor — trace every claim to its root",
};

export default function RootLayout({ children }: PropsWithChildren) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable} min-h-svh antialiased`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
