import type { RunState } from "@/core/run/domain";

const LABEL_COLOR: Record<string, string> = {
    contradicted: "text-[var(--au-flag)]",
    drifted: "text-[var(--au-flag)]",
    "partially-supported": "text-[var(--au-caution)]",
    supported: "text-[var(--au-healthy)]",
};

export function DriftPanel({
    state,
    selectedId,
    onClose,
}: {
    state: RunState;
    selectedId: string;
    onClose: () => void;
}) {
    const drift = state.driftFindings.find((d) => d.workId === selectedId);
    const node = state.graph.nodes.find((n) => n.id === selectedId);

    if (!drift) return null;

    return (
        <div className="absolute inset-y-0 right-0 z-10 w-[360px] border-[var(--au-rule)] border-l bg-[var(--au-paper-2)] p-4 text-[var(--au-ink)] shadow-lg">
            <div className="flex items-center justify-between">
                <span
                    className={`font-[family-name:var(--font-display)] font-semibold ${LABEL_COLOR[drift.label]}`}
                >
                    {drift.label.toUpperCase()}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-[var(--au-neutral)] hover:text-[var(--au-ink)]"
                    aria-label="Close drift panel"
                >
                    ✕
                </button>
            </div>
            <p className="mt-1 text-[var(--au-muted)] text-xs">
                {node?.title} · basis: {drift.basis}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3">
                <div className="rounded border border-[var(--au-rule)] bg-[var(--au-panel)] p-2">
                    <p className="text-[10px] text-[var(--au-neutral)] uppercase">
                        Origin said
                    </p>
                    <p className="font-[family-name:var(--font-mono)] text-sm italic">
                        “{drift.evidenceQuote ?? "no verbatim span available"}”
                    </p>
                </div>
                <div className="rounded border border-[var(--au-rule)] bg-[var(--au-panel)] p-2">
                    <p className="text-[10px] text-[var(--au-neutral)] uppercase">
                        Cited as
                    </p>
                    <p className="font-[family-name:var(--font-mono)] text-sm italic">
                        “{state.claim}”
                    </p>
                </div>
            </div>
            <p className="mt-3 text-[var(--au-muted)] text-xs">
                {drift.explanation}
            </p>
        </div>
    );
}
