/**
 * Hand-built SVG citation graph (Hallmark enrichment Tier B). The page's
 * central diagram: many papers converging on one fragile origin. Nodes
 * ink-on once on load (CSS, forwards, no infinite loops).
 */
export function CitationGraph() {
    return (
        <figure className="lp-graph-wrap">
            <svg
                className="lp-graph"
                viewBox="0 0 440 340"
                role="img"
                aria-label="A citation graph: many papers converging on a single fragile origin study"
            >
                <title>
                    Citation graph converging on a single fragile origin
                </title>
                {/* edges: citing → cited */}
                <g className="lp-edges">
                    <line x1="64" y1="46" x2="188" y2="126" />
                    <line x1="146" y1="34" x2="188" y2="126" />
                    <line x1="308" y1="44" x2="188" y2="126" />
                    <line x1="372" y1="96" x2="308" y2="176" />
                    <line x1="64" y1="188" x2="188" y2="126" />
                    <line x1="330" y1="290" x2="308" y2="176" />
                    <line
                        className="lp-edge--hot"
                        x1="188"
                        y1="126"
                        x2="228"
                        y2="248"
                    />
                    <line
                        className="lp-edge--hot"
                        x1="308"
                        y1="176"
                        x2="228"
                        y2="248"
                    />
                    <line
                        className="lp-edge--hot"
                        x1="96"
                        y1="268"
                        x2="228"
                        y2="248"
                    />
                </g>
                {/* nodes, staggered ink-on via --i */}
                <g className="lp-nodes">
                    <circle
                        style={{ ["--i" as string]: 0 }}
                        cx="64"
                        cy="46"
                        r="10"
                    />
                    <circle
                        style={{ ["--i" as string]: 1 }}
                        cx="146"
                        cy="34"
                        r="8"
                    />
                    <circle
                        style={{ ["--i" as string]: 1 }}
                        cx="308"
                        cy="44"
                        r="9"
                    />
                    <circle
                        style={{ ["--i" as string]: 2 }}
                        cx="372"
                        cy="96"
                        r="8"
                    />
                    <circle
                        style={{ ["--i" as string]: 2 }}
                        cx="64"
                        cy="188"
                        r="9"
                    />
                    <circle
                        style={{ ["--i" as string]: 2 }}
                        cx="330"
                        cy="290"
                        r="7"
                    />
                    <circle
                        style={{ ["--i" as string]: 3 }}
                        cx="188"
                        cy="126"
                        r="13"
                    />
                    <circle
                        style={{ ["--i" as string]: 3 }}
                        cx="308"
                        cy="176"
                        r="10"
                    />
                    <circle
                        style={{ ["--i" as string]: 3 }}
                        cx="96"
                        cy="268"
                        r="8"
                    />
                    <circle
                        style={{ ["--i" as string]: 4 }}
                        className="lp-node--origin"
                        cx="228"
                        cy="248"
                        r="16"
                    />
                </g>
                <g className="lp-graph-labels">
                    <text x="158" y="106">
                        review
                    </text>
                    <text x="252" y="253" className="lp-lbl--origin">
                        origin · preprint · never replicated
                    </text>
                </g>
            </svg>
            <figcaption className="lp-legend">
                <span>
                    <i className="lp-dot" /> paper
                </span>
                <span>
                    <i className="lp-dot lp-dot--origin" /> fragile origin
                </span>
                <span>
                    <i className="lp-dash" /> support chain
                </span>
            </figcaption>
        </figure>
    );
}
