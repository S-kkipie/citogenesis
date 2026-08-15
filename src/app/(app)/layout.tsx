import Link from "next/link";
import type { PropsWithChildren } from "react";
import "./audit/audit.css";

export default function AppLayout({ children }: PropsWithChildren) {
    return (
        <div className="audit-scope min-h-svh bg-[var(--au-paper)] text-[var(--au-ink)]">
            <header className="flex h-14 items-center justify-between border-[var(--au-rule)] border-b bg-[var(--au-paper)] px-6">
                <span className="flex items-center gap-2 font-[family-name:var(--font-display)] font-medium text-[var(--au-ink)] tracking-wide">
                    <span
                        aria-hidden
                        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--au-accent)]"
                    />
                    Citogenesis
                </span>
                <nav className="flex items-center gap-4 font-[family-name:var(--font-body)] text-sm">
                    <Link
                        href="/audit"
                        className="text-[var(--au-muted)] hover:text-[var(--au-ink)]"
                    >
                        Audit
                    </Link>
                    <Link
                        href="/runs"
                        className="text-[var(--au-muted)] hover:text-[var(--au-ink)]"
                    >
                        Runs
                    </Link>
                </nav>
            </header>
            <main>{children}</main>
        </div>
    );
}
