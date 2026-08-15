"use client";

import { Background, Controls, type Edge, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { GraphView } from "@/core/run/client/graph-view";
import { CitationFlowNode, type CitationRFNode } from "./CitationFlowNode";

const nodeTypes = { citation: CitationFlowNode };

export function CitationGraph({
    view,
    onNodeClick,
}: {
    view: GraphView;
    onNodeClick?: (id: string) => void;
}) {
    const nodes = useMemo<CitationRFNode[]>(() => {
        const perDepth = new Map<number, number>();

        return view.nodes.map((nv) => {
            const d = nv.node.depth;
            const row = perDepth.get(d) ?? 0;
            perDepth.set(d, row + 1);

            return {
                id: nv.node.id,
                type: "citation",
                position: { x: d * 220, y: row * 90 },
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
        <div className="h-full w-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                onNodeClick={(_, node) => onNodeClick?.(node.id)}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#E1E4E8" />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
