"use client";

import { Background, Controls, type Edge, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { GraphView } from "@/core/run/client/graph-view";
import { CitationFlowNode, type CitationRFNode } from "./CitationFlowNode";

const nodeTypes = { citation: CitationFlowNode };

/** Layout constants for the layered graph. */
const ROWS_PER_COLUMN = 14;
const COLUMN_WIDTH = 210;
const ROW_HEIGHT = 90;
const BAND_GAP = 110;

export function CitationGraph({
    view,
    onNodeClick,
}: {
    view: GraphView;
    onNodeClick?: (id: string) => void;
}) {
    const nodes = useMemo<CitationRFNode[]>(() => {
        // A depth band can hold well over a hundred nodes at depth 2–3, so
        // each band wraps into sub-columns instead of running as one tall
        // strip. Bands are then laid left-to-right by depth, each starting
        // where the previous one ended.
        const countByDepth = new Map<number, number>();
        for (const nv of view.nodes) {
            const d = nv.node.depth;
            countByDepth.set(d, (countByDepth.get(d) ?? 0) + 1);
        }

        const bandStart = new Map<number, number>();
        let x = 0;
        for (const d of [...countByDepth.keys()].sort((a, b) => a - b)) {
            bandStart.set(d, x);
            const subColumns = Math.ceil(
                (countByDepth.get(d) ?? 0) / ROWS_PER_COLUMN,
            );
            x += subColumns * COLUMN_WIDTH + BAND_GAP;
        }

        const seenInDepth = new Map<number, number>();
        return view.nodes.map((nv) => {
            const d = nv.node.depth;
            const index = seenInDepth.get(d) ?? 0;
            seenInDepth.set(d, index + 1);

            return {
                id: nv.node.id,
                type: "citation",
                position: {
                    x:
                        (bandStart.get(d) ?? 0) +
                        Math.floor(index / ROWS_PER_COLUMN) * COLUMN_WIDTH,
                    y: (index % ROWS_PER_COLUMN) * ROW_HEIGHT,
                },
                data: { view: nv },
            };
        });
    }, [view]);

    const edges = useMemo<Edge[]>(
        () =>
            view.edges.map((ev) => ({
                id: ev.id,
                source: ev.edge.from,
                target: ev.edge.to,
                animated: ev.kind === "cycle",
                style: {
                    stroke: ev.kind === "cycle" ? "#CF222E" : "#57606A",
                    strokeWidth:
                        ev.kind === "cycle"
                            ? 3
                            : ev.kind === "support-path"
                              ? 2
                              : 1,
                },
            })),
        [view],
    );

    return (
        <div className="h-full w-full bg-[var(--au-canvas)]">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                onNodeClick={(_, node) => onNodeClick?.(node.id)}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="var(--au-canvas-rule)" />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
