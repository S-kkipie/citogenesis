import type { PropsWithChildren } from "react";

export default function AppLayout({ children }: PropsWithChildren) {
    return (
        <div className="min-h-svh">
            <header className="flex items-center justify-between border-b px-6 py-3">
                <span className="font-semibold">Citogenesis</span>
                <span className="text-muted-foreground text-sm">
                    Trace every claim to its root.
                </span>
            </header>
            <main>{children}</main>
        </div>
    );
}
