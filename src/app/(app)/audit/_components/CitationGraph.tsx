"use client";

import { Background, Controls, type Edge, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { GraphView } from "@/core/run/client/graph-view";
import { radialLayout } from "../_lib/radial-layout";
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
        const placed = radialLayout(view);
        // In-degree stands in for how load-bearing a paper is: the more of
        // this graph leans on it, the bigger it draws.
        const inDegree = new Map<string, number>();
        for (const ev of view.edges) {
            inDegree.set(ev.edge.to, (inDegree.get(ev.edge.to) ?? 0) + 1);
        }
        const maxIn = Math.max(1, ...inDegree.values());

        return view.nodes.map((nv) => {
            const at = placed.get(nv.node.id);
            const cited = inDegree.get(nv.node.id) ?? 0;
            return {
                id: nv.node.id,
                type: "citation",
                position: { x: at?.x ?? 0, y: at?.y ?? 0 },
                data: {
                    view: nv,
                    weight: cited / maxIn,
                    // 200 labels is noise. Name only the nodes the reader
                    // needs: the origins, the diseased, and the hubs.
                    showLabel:
                        nv.isOrigin ||
                        nv.inCycle ||
                        nv.severity === "flagged" ||
                        nv.node.depth === 0 ||
                        cited >= Math.max(3, maxIn * 0.4),
                },
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
                // Straight lines: with a radial layout the edges are spokes,
                // and bezier curves would smear that structure back into a
                // mesh. Plain citations run faint so the flagged paths and
                // cycles read on top of them.
                type: "straight",
                style: {
                    stroke: ev.kind === "cycle" ? "#CF222E" : "#57606A",
                    strokeWidth:
                        ev.kind === "cycle"
                            ? 2.5
                            : ev.kind === "support-path"
                              ? 1.75
                              : 0.75,
                    strokeOpacity: ev.kind === "citation" ? 0.28 : 0.9,
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
                // Breathing room, and room on the right for the drift panel
                // that overlays this pane when an origin is selected.
                fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
                minZoom={0.05}
                onNodeClick={(_, node) => onNodeClick?.(node.id)}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="var(--au-canvas-rule)" />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
