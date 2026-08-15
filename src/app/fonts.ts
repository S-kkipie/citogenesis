import { Geist, Geist_Mono, Tomorrow } from "next/font/google";

export const fontDisplay = Tomorrow({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-display",
    display: "swap",
});

export const fontBody = Geist({
    subsets: ["latin"],
    variable: "--font-body",
    display: "swap",
});

export const fontMono = Geist_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
    display: "swap",
});
