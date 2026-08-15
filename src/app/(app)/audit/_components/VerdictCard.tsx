import type { Verdict } from "@/core/run/domain";

const DOT: Record<Verdict["confidence"], string> = {
    LOW: "bg-[var(--au-flag)]",
    MEDIUM: "bg-[var(--au-caution)]",
    HIGH: "bg-[var(--au-healthy)]",
};

export function VerdictCard({
    verdict,
    embedded = false,
}: {
    verdict: Verdict | null;
    /** Inside a rail card: no outer border/padding, hidden while null. */
    embedded?: boolean;
}) {
    if (!verdict) {
        if (embedded) return null;
        return (
            <div className="border-[var(--au-rule)] border-b p-4 text-[var(--au-muted)] text-sm">
                Awaiting verdict…
            </div>
        );
    }

    return (
        <div
            className={
                embedded
                    ? "mt-2 border-[var(--au-rule)] border-t pt-2"
                    : "border-[var(--au-rule)] border-b p-4"
            }
        >
            <div className="flex items-center gap-2">
                <span
                    className={`h-3 w-3 rounded-full ${DOT[verdict.confidence]}`}
                />
                <span className="font-[family-name:var(--font-display)] font-semibold text-[var(--au-ink)]">
                    {verdict.confidence}
                </span>
                <span className="ml-auto font-[family-name:var(--font-mono)] text-[var(--au-muted)] text-sm">
                    score {verdict.score}
                </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
                {verdict.pathogens.map((p) => (
                    <span
                        key={p}
                        className="rounded border border-[var(--au-flag)]/30 bg-[var(--au-flag)]/15 px-1.5 py-0.5 text-[11px] text-[var(--au-flag)]"
                    >
                        {p}
                    </span>
                ))}
            </div>
            <p className="mt-2 font-[family-name:var(--font-mono)] text-[var(--au-muted)] text-xs">
                coverage {verdict.coverage.resolved}/{verdict.coverage.total} ·
                primary {Math.round(verdict.primaryRatio * 100)}%
            </p>
            <p className="mt-2 text-[var(--au-muted)] text-sm">
                {verdict.prose}
            </p>
        </div>
    );
}
