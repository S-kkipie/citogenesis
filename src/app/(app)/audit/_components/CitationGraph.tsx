"use client";

import { createNodeBorderProgram } from "@sigma/node-border";
import Graph from "graphology";
import { useEffect, useRef } from "react";
import Sigma from "sigma";
import type { GraphView } from "@/core/run/client/graph-view";
import { syncGraph } from "../_lib/graph-sync";

/**
 * WebGL citation graph (Sigma v3 over graphology).
 *
 * The renderer and its graphology instance live for the whole mount; view
 * changes are synced into the existing instance (graph-sync.ts) so a live
 * run can stream nodes in without killing the camera or the WebGL context.
 */

const CANVAS_INK = "#1F2328";
const EDGE_PLAIN = "#D0D7DE";
const DIMMED = "#EAEEF2";

/** Solid disc for primary sources, hollow ring for secondary/unresolved. */
const NodeProgram = createNodeBorderProgram({
    borders: [
        { color: { attribute: "borderColor" }, size: { value: 0.35 } },
        { color: { attribute: "fillColor" }, size: { fill: true } },
    ],
});

const CASCADE_FIRST_MS = 220;
const CASCADE_STEP_MS = 420;

export function CitationGraph({
    view,
    onNodeClick,
    selectedId = null,
    insetRight = 0,
    cascade = false,
}: {
    view: GraphView;
    onNodeClick?: (id: string | null) => void;
    /** Node the inspector is open on; drawn with a halo. */
    selectedId?: string | null;
    /** Pixels of the pane covered by an overlay, so the graph keeps clear
     * of it: Sigma refits when its container resizes. */
    insetRight?: number;
    /** Replay mode: reveal the chain one citation ring at a time. Live mode
     * leaves this false — nodes appear the moment they stream in. */
    cascade?: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<Sigma | null>(null);
    const graphRef = useRef<Graph | null>(null);
    const clickRef = useRef(onNodeClick);
    clickRef.current = onNodeClick;
    // Read inside the reducers, which are created once with the renderer.
    const selectedRef = useRef(selectedId);
    selectedRef.current = selectedId;
    /** Depth ≤ this is visible; Infinity = everything (live mode). */
    const revealRef = useRef(Number.POSITIVE_INFINITY);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const g = new Graph({ multi: false, type: "directed" });
        graphRef.current = g;

        let hovered: string | null = null;
        let neighbours = new Set<string>();

        const renderer = new Sigma(g, container, {
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
                if (((data.depth as number) ?? 0) > revealRef.current) {
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
                if (node === hovered) {
                    return {
                        ...data,
                        label: (data.title as string) ?? data.label,
                        zIndex: 1,
                    };
                }
                if (neighbours.has(node)) {
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
                const [from, to] = g.extremities(edge);
                const deepest = Math.max(
                    (g.getNodeAttribute(from, "depth") as number) ?? 0,
                    (g.getNodeAttribute(to, "depth") as number) ?? 0,
                );
                if (deepest > revealRef.current) {
                    return { ...data, hidden: true };
                }
                if (!hovered) return data;
                const touches = from === hovered || to === hovered;
                return touches
                    ? { ...data, size: Math.max(data.size, 1.4), zIndex: 1 }
                    : { ...data, color: DIMMED, zIndex: 0 };
            },
        });

        renderer.on("enterNode", ({ node }) => {
            hovered = node;
            neighbours = new Set(g.neighbors(node));
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

        return () => {
            rendererRef.current = null;
            graphRef.current = null;
            renderer.kill();
        };
    }, []);

    useEffect(() => {
        const g = graphRef.current;
        const renderer = rendererRef.current;
        if (!g || !renderer) return;

        syncGraph(g, view);

        const reduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        const maxDepth = view.nodes.reduce(
            (deepest, nv) => Math.max(deepest, nv.node.depth),
            0,
        );

        if (!cascade || reduced || maxDepth === 0) {
            revealRef.current = Number.POSITIVE_INFINITY;
            renderer.refresh();
            return;
        }

        // Replay: reveal the chain one citation ring at a time, so a viewer
        // can see the trace walk backwards instead of a graph appearing at
        // once.
        revealRef.current = 0;
        renderer.refresh();
        let timer: number | undefined;
        const step = () => {
            revealRef.current += 1;
            renderer.refresh({ skipIndexation: true });
            if (revealRef.current < maxDepth) {
                timer = window.setTimeout(step, CASCADE_STEP_MS);
            }
        };
        timer = window.setTimeout(step, CASCADE_FIRST_MS);
        return () => {
            if (timer) window.clearTimeout(timer);
        };
    }, [view, cascade]);

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
