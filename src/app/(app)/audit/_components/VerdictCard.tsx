import type { Verdict } from "@/core/run/domain";

const DOT: Record<Verdict["confidence"], string> = {
    LOW: "bg-[#CF222E]",
    MEDIUM: "bg-[#9A6700]",
    HIGH: "bg-[#1A7F37]",
};

export function VerdictCard({ verdict }: { verdict: Verdict | null }) {
    if (!verdict) {
        return (
            <div className="border-b p-4 text-sm text-[#57606A]">
                Awaiting verdict…
            </div>
        );
    }

    return (
        <div className="border-b p-4">
            <div className="flex items-center gap-2">
                <span
                    className={`h-3 w-3 rounded-full ${DOT[verdict.confidence]}`}
                />
                <span className="font-semibold">{verdict.confidence}</span>
                <span className="ml-auto text-sm text-[#57606A]">
                    score {verdict.score}
                </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
                {verdict.pathogens.map((p) => (
                    <span
                        key={p}
                        className="rounded bg-[#FBE9E7] px-1.5 py-0.5 text-[11px] text-[#CF222E]"
                    >
                        {p}
                    </span>
                ))}
            </div>
            <p className="mt-2 text-xs text-[#57606A]">
                coverage {verdict.coverage.resolved}/{verdict.coverage.total} ·
                primary {Math.round(verdict.primaryRatio * 100)}%
            </p>
            <p className="mt-2 text-sm">{verdict.prose}</p>
        </div>
    );
}
