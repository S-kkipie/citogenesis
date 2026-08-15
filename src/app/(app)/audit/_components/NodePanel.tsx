import type { CitationNode, DriftFinding, RunState } from "@/core/run/domain";

const DRIFT_COLOR: Record<DriftFinding["label"], string> = {
    contradicted: "text-[var(--au-flag)]",
    drifted: "text-[var(--au-flag)]",
    "partially-supported": "text-[var(--au-caution)]",
    supported: "text-[var(--au-healthy)]",
};

const PRIMACY_LABEL: Record<string, string> = {
    primary: "Primary — reports original data",
    secondary: "Secondary — reviews or cites others",
    unknown: "Unclassified",
};

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-2 py-0.5 text-xs">
            <span className="w-20 shrink-0 text-[var(--au-neutral)]">
                {label}
            </span>
            <span className="min-w-0 break-words text-[var(--au-ink)]">
                {value}
            </span>
        </div>
    );
}

function Badge({ text, tone }: { text: string; tone: string }) {
    return (
        <span
            className={`rounded border px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] ${tone}`}
        >
            {text}
        </span>
    );
}

function authorLine(node: CitationNode): string {
    if (node.authors.length === 0) return "—";
    const [first] = node.authors;
    return node.authors.length > 3
        ? `${first} et al. (${node.authors.length} authors)`
        : node.authors.join(", ");
}

/**
 * Inspector for whichever node the reader clicked. Every node has an
 * identity worth showing; only the origins carry a drift finding, which is
 * appended below the metadata when present.
 */
export function NodePanel({
    state,
    selectedId,
    onClose,
}: {
    state: RunState;
    selectedId: string;
    onClose: () => void;
}) {
    const node = state.graph.nodes.find((n) => n.id === selectedId);
    if (!node) return null;

    const drift = state.driftFindings.find((d) => d.workId === selectedId);
    const isOrigin = state.originCandidates.includes(selectedId);
    const inCycle = state.cycles.some((cycle) => cycle.includes(selectedId));
    const citedBy = state.graph.edges.filter((e) => e.to === selectedId).length;
    const cites = state.graph.edges.filter((e) => e.from === selectedId).length;
    const unresolved = node.fetchStatus === "unresolved";

    return (
        <aside className="absolute inset-y-0 right-0 z-10 w-[360px] overflow-y-auto border-[var(--au-rule)] border-l bg-[var(--au-paper-2)] p-4 text-[var(--au-ink)] shadow-lg">
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                    {isOrigin && (
                        <Badge
                            text="ORIGIN"
                            tone="border-[var(--au-accent)] text-[var(--au-accent)]"
                        />
                    )}
                    {node.isRetracted && (
                        <Badge
                            text="RETRACTED"
                            tone="border-[var(--au-flag)] text-[var(--au-flag)]"
                        />
                    )}
                    {inCycle && (
                        <Badge
                            text="IN CYCLE"
                            tone="border-[var(--au-flag)] text-[var(--au-flag)]"
                        />
                    )}
                    {unresolved && (
                        <Badge
                            text="UNRESOLVED"
                            tone="border-[var(--au-rule)] text-[var(--au-neutral)]"
                        />
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 text-[var(--au-neutral)] hover:text-[var(--au-ink)]"
                    aria-label="Close node panel"
                >
                    ✕
                </button>
            </div>

            <h2 className="mt-2 font-[family-name:var(--font-display)] font-semibold text-sm leading-snug">
                {unresolved ? "Unresolved reference" : node.title}
            </h2>

            {unresolved ? (
                <p className="mt-2 text-[var(--au-muted)] text-xs">
                    Neither OpenAlex nor Semantic Scholar returned a record for{" "}
                    {node.id}. It stays in the graph so the coverage count stays
                    honest, but nothing is known about it.
                </p>
            ) : (
                <div className="mt-3 border-[var(--au-rule)] border-t pt-2">
                    <Row label="Authors" value={authorLine(node)} />
                    <Row label="Year" value={node.year?.toString() ?? "—"} />
                    <Row label="Venue" value={node.venue ?? "—"} />
                    <Row label="Type" value={node.type} />
                    <Row
                        label="Primacy"
                        value={
                            PRIMACY_LABEL[node.primacy?.label ?? "unknown"] ??
                            "Unclassified"
                        }
                    />
                    {node.primacy?.rationale && (
                        <Row label="Why" value={node.primacy.rationale} />
                    )}
                    <Row
                        label="In graph"
                        value={`cited by ${citedBy} · cites ${cites} · depth ${node.depth}`}
                    />
                    <Row
                        label="Cited by"
                        value={`${node.citedByCount.toLocaleString()} works (all of OpenAlex)`}
                    />
                </div>
            )}

            {(node.doi || node.oaUrl) && (
                <div className="mt-3 flex flex-wrap gap-3 border-[var(--au-rule)] border-t pt-2 text-xs">
                    {node.doi && (
                        <a
                            className="text-[var(--au-accent)] underline"
                            href={
                                node.doi.startsWith("http")
                                    ? node.doi
                                    : `https://doi.org/${node.doi}`
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            DOI ↗
                        </a>
                    )}
                    {node.oaUrl && (
                        <a
                            className="text-[var(--au-accent)] underline"
                            href={node.oaUrl}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Open access full text ↗
                        </a>
                    )}
                    <a
                        className="text-[var(--au-neutral)] underline"
                        href={`https://openalex.org/${node.id}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        OpenAlex ↗
                    </a>
                </div>
            )}

            {drift && (
                <div className="mt-4 border-[var(--au-rule)] border-t pt-3">
                    <div className="flex items-baseline justify-between">
                        <span
                            className={`font-[family-name:var(--font-display)] font-semibold ${DRIFT_COLOR[drift.label]}`}
                        >
                            {drift.label.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-[var(--au-neutral)]">
                            basis: {drift.basis}
                        </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                        <div className="rounded border border-[var(--au-rule)] bg-[var(--au-panel)] p-2">
                            <p className="text-[10px] text-[var(--au-neutral)] uppercase">
                                Origin said
                            </p>
                            {drift.evidenceQuote ? (
                                <p className="font-[family-name:var(--font-mono)] text-sm italic">
                                    “{drift.evidenceQuote}”
                                </p>
                            ) : (
                                <p className="text-[var(--au-neutral)] text-xs">
                                    No verbatim span in the available text — see
                                    the explanation below.
                                </p>
                            )}
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
                    <p className="mt-2 text-[var(--au-muted)] text-xs">
                        {drift.explanation}
                    </p>
                </div>
            )}

            {node.abstract && !unresolved && (
                <details className="mt-3 border-[var(--au-rule)] border-t pt-2">
                    <summary className="cursor-pointer text-[var(--au-neutral)] text-xs">
                        Abstract
                    </summary>
                    <p className="mt-1 text-[var(--au-muted)] text-xs leading-relaxed">
                        {node.abstract}
                    </p>
                </details>
            )}
        </aside>
    );
}
