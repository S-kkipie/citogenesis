import type { RunState } from "@/core/run/domain";

const LABEL_COLOR: Record<string, string> = {
    contradicted: "text-[#CF222E]",
    drifted: "text-[#CF222E]",
    "partially-supported": "text-[#9A6700]",
    supported: "text-[#1A7F37]",
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
        <div className="absolute inset-y-0 right-0 z-10 w-[360px] border-l bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between">
                <span className={`font-semibold ${LABEL_COLOR[drift.label]}`}>
                    {drift.label.toUpperCase()}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-[#57606A]"
                    aria-label="Close drift panel"
                >
                    ✕
                </button>
            </div>
            <p className="mt-1 text-xs text-[#57606A]">
                {node?.title} · basis: {drift.basis}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3">
                <div className="rounded border p-2">
                    <p className="text-[10px] uppercase text-[#57606A]">
                        Origin said
                    </p>
                    <p className="text-sm italic">
                        “{drift.evidenceQuote ?? "no verbatim span available"}”
                    </p>
                </div>
                <div className="rounded border p-2">
                    <p className="text-[10px] uppercase text-[#57606A]">
                        Cited as
                    </p>
                    <p className="text-sm">“{state.claim}”</p>
                </div>
            </div>
            <p className="mt-3 text-xs text-[#1A1F26]">{drift.explanation}</p>
        </div>
    );
}
