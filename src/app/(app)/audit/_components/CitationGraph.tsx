"use client";

import { createNodeBorderProgram } from "@sigma/node-border";
import Graph from "graphology";
import { useEffect, useMemo, useRef } from "react";
import Sigma from "sigma";
import type { GraphView, NodeSeverity } from "@/core/run/client/graph-view";
import { radialLayout } from "../_lib/radial-layout";

/**
 * WebGL citation graph (Sigma v3 over graphology).
 *
 * The visual language is carried by node attributes rather than by React
 * components: fill = severity, border = primacy, size = in-degree, and the
 * label is only written for nodes worth naming. Positions come from
 * `radialLayout` — Sigma renders, it does not lay out.
 */

const SEVERITY_COLOR: Record<NodeSeverity, string> = {
    flagged: "#CF222E",
    caution: "#9A6700",
    healthy: "#1A7F37",
    neutral: "#8C959F",
};

const CANVAS_INK = "#1F2328";
const EDGE_PLAIN = "#D0D7DE";
const EDGE_SUPPORT = "#57606A";
const EDGE_CYCLE = "#CF222E";
const DIMMED = "#EAEEF2";

/** Full paper titles run long enough to cover the canvas. */
const LABEL_MAX = 46;
const truncate = (title: string) =>
    title.length > LABEL_MAX ? `${title.slice(0, LABEL_MAX - 1)}…` : title;

const MIN_SIZE = 3;
const MAX_SIZE = 16;

/** Solid disc for primary sources, hollow ring for secondary/unresolved. */
const NodeProgram = createNodeBorderProgram({
    borders: [
        { color: { attribute: "borderColor" }, size: { value: 0.35 } },
        { color: { attribute: "fillColor" }, size: { fill: true } },
    ],
});

export function CitationGraph({
    view,
    onNodeClick,
    selectedId = null,
    insetRight = 0,
}: {
    view: GraphView;
    onNodeClick?: (id: string | null) => void;
    /** Node the inspector is open on; drawn with a halo. */
    selectedId?: string | null;
    /** Pixels of the pane covered by an overlay, so the graph keeps clear
     * of it: Sigma refits when its container resizes. */
    insetRight?: number;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<Sigma | null>(null);
    const clickRef = useRef(onNodeClick);
    clickRef.current = onNodeClick;
    // Read inside the reducers, which are created once with the renderer.
    const selectedRef = useRef(selectedId);
    selectedRef.current = selectedId;

    const graph = useMemo(() => {
        const g = new Graph({ multi: false, type: "directed" });
        const placed = radialLayout(view);

        // In-degree stands in for how load-bearing a paper is.
        const inDegree = new Map<string, number>();
        for (const ev of view.edges) {
            inDegree.set(ev.edge.to, (inDegree.get(ev.edge.to) ?? 0) + 1);
        }
        const maxIn = Math.max(1, ...inDegree.values());

        for (const nv of view.nodes) {
            const at = placed.get(nv.node.id);
            const cited = inDegree.get(nv.node.id) ?? 0;
            const colour = SEVERITY_COLOR[nv.severity];
            const solid = nv.shape === "solid";
            // sqrt so a hub with 10x the citations reads as ~3x the dot.
            const size =
                MIN_SIZE +
                Math.sqrt(cited / maxIn) * (MAX_SIZE - MIN_SIZE) +
                (nv.isOrigin ? 4 : 0);

            g.addNode(nv.node.id, {
                x: at?.x ?? 0,
                y: at?.y ?? 0,
                size,
                type: "bordered",
                color: colour,
                borderColor: colour,
                // Hollow centre unless the node holds original data.
                fillColor: solid ? colour : "#FFFFFF",
                // Naming all 200 is noise; name the ones the reader needs.
                label:
                    nv.isOrigin ||
                    nv.inCycle ||
                    nv.severity === "flagged" ||
                    nv.node.depth === 0 ||
                    cited >= Math.max(3, maxIn * 0.4)
                        ? truncate(nv.node.title)
                        : "",
                title: nv.node.title,
                depth: nv.node.depth,
            });
        }

        for (const ev of view.edges) {
            if (!g.hasNode(ev.edge.from) || !g.hasNode(ev.edge.to)) continue;
            if (g.hasEdge(ev.edge.from, ev.edge.to)) continue;
            g.addEdgeWithKey(ev.id, ev.edge.from, ev.edge.to, {
                size:
                    ev.kind === "cycle"
                        ? 2.5
                        : ev.kind === "support-path"
                          ? 1.6
                          : 0.6,
                color:
                    ev.kind === "cycle"
                        ? EDGE_CYCLE
                        : ev.kind === "support-path"
                          ? EDGE_SUPPORT
                          : EDGE_PLAIN,
                kind: ev.kind,
            });
        }

        return g;
    }, [view]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let hovered: string | null = null;
        let neighbours = new Set<string>();
        // The chain is revealed one citation ring at a time, so a viewer can
        // see the trace walk backwards instead of a graph appearing at once.
        const maxDepth = Math.max(
            0,
            ...graph.mapNodes((_, attrs) => (attrs.depth as number) ?? 0),
        );
        const reduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        let revealedDepth = reduced ? maxDepth : 0;

        const renderer = new Sigma(graph, container, {
            nodeProgramClasses: { bordered: NodeProgram },
            defaultEdgeColor: EDGE_PLAIN,
            labelColor: { color: CANVAS_INK },
            labelFont: "var(--font-body), system-ui, sans-serif",
            labelSize: 11,
            labelDensity: 0.35,
            // Sigma hides labels for nodes below this on-screen size, which
            // keeps a dense ring legible while hubs stay named.
            labelRenderedSizeThreshold: 5,
            zIndex: true,
            minCameraRatio: 0.05,
            maxCameraRatio: 4,
            // Hovering a paper fades everything it isn't connected to — the
            // only practical way to read one citation path out of hundreds.
            nodeReducer: (node, data) => {
                if (((data.depth as number) ?? 0) > revealedDepth) {
                    return { ...data, hidden: true };
                }
                const selected = node === selectedRef.current;
                if (selected) {
                    return {
                        ...data,
                        size: data.size * 1.6,
                        label: (data.title as string) ?? data.label,
                        borderColor: CANVAS_INK,
                        zIndex: 2,
                    };
                }
                if (!hovered) return data;
                if (node === hovered || neighbours.has(node)) {
                    return { ...data, zIndex: 1 };
                }
                return {
                    ...data,
                    label: "",
                    color: DIMMED,
                    borderColor: DIMMED,
                    fillColor: DIMMED,
                    zIndex: 0,
                };
            },
            edgeReducer: (edge, data) => {
                const [from, to] = graph.extremities(edge);
                const deepest = Math.max(
                    (graph.getNodeAttribute(from, "depth") as number) ?? 0,
                    (graph.getNodeAttribute(to, "depth") as number) ?? 0,
                );
                if (deepest > revealedDepth) return { ...data, hidden: true };
                if (!hovered) return data;
                const touches = from === hovered || to === hovered;
                return touches
                    ? { ...data, size: Math.max(data.size, 1.4), zIndex: 1 }
                    : { ...data, color: DIMMED, zIndex: 0 };
            },
        });

        renderer.on("enterNode", ({ node }) => {
            hovered = node;
            neighbours = new Set(graph.neighbors(node));
            renderer.refresh({ skipIndexation: true });
        });
        renderer.on("leaveNode", () => {
            hovered = null;
            neighbours = new Set();
            renderer.refresh({ skipIndexation: true });
        });
        renderer.on("clickNode", ({ node }) => clickRef.current?.(node));
        // Clicking empty canvas dismisses the inspector.
        renderer.on("clickStage", () => clickRef.current?.(null));
        rendererRef.current = renderer;

        let timer: number | undefined;
        if (!reduced && maxDepth > 0) {
            const step = () => {
                revealedDepth += 1;
                renderer.refresh({ skipIndexation: true });
                if (revealedDepth < maxDepth)
                    timer = window.setTimeout(step, 420);
            };
            timer = window.setTimeout(step, 220);
        }

        return () => {
            if (timer) window.clearTimeout(timer);
            rendererRef.current = null;
            renderer.kill();
        };
    }, [graph]);

    const zoom = (factor: number) =>
        rendererRef.current
            ?.getCamera()
            .animate(
                { ratio: rendererRef.current.getCamera().ratio * factor },
                { duration: 220 },
            );

    return (
        <>
            <div
                ref={containerRef}
                className="h-full w-full bg-[var(--au-canvas)]"
                // Sigma sizes its canvases from the container, which must
                // therefore have a resolved height before it mounts.
                style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: insetRight,
                    transition: "right 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
            />
            <div className="absolute bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded border border-[var(--au-canvas-rule)] bg-[var(--au-canvas)]/90 shadow-sm">
                <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => zoom(1 / 1.4)}
                    className="px-2 py-1 text-[var(--au-canvas-ink)] text-xs hover:bg-[var(--au-paper)]"
                >
                    +
                </button>
                <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => zoom(1.4)}
                    className="border-[var(--au-canvas-rule)] border-t px-2 py-1 text-[var(--au-canvas-ink)] text-xs hover:bg-[var(--au-paper)]"
                >
                    −
                </button>
                <button
                    type="button"
                    aria-label="Fit graph to view"
                    onClick={() =>
                        rendererRef.current
                            ?.getCamera()
                            .animate(
                                { x: 0.5, y: 0.5, ratio: 1 },
                                { duration: 260 },
                            )
                    }
                    className="border-[var(--au-canvas-rule)] border-t px-2 py-1 text-[var(--au-canvas-ink)] text-xs hover:bg-[var(--au-paper)]"
                >
                    ⤢
                </button>
            </div>
        </>
    );
}
