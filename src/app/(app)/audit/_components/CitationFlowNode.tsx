"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { motion } from "motion/react";
import type { NodeView } from "@/core/run/client/graph-view";
import {
    SEVERITY_FILL,
    SEVERITY_RING,
    SHAPE_CLASS,
} from "../_lib/severity-styles";

export type CitationNodeData = { view: NodeView };
export type CitationRFNode = Node<CitationNodeData, "citation">;

export function CitationFlowNode({ data }: NodeProps<CitationRFNode>) {
    const { view } = data;
    const filled = view.shape === "solid";

    return (
        <div className="flex flex-col items-center gap-1">
            <Handle
                type="target"
                position={Position.Top}
                className="opacity-0"
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                    delay: view.node.depth * 0.22,
                    duration: 0.42,
                    ease: [0.16, 1, 0.3, 1],
                }}
                className={[
                    "h-6 w-6 rounded-full",
                    SHAPE_CLASS[view.shape],
                    SEVERITY_RING[view.severity],
                    filled ? SEVERITY_FILL[view.severity] : "",
                    view.inCycle ? "animate-pulse" : "",
                ].join(" ")}
                title={view.pathogens.join(", ") || "clean"}
            />
            <span className="max-w-[8rem] truncate text-[10px] text-[#1A1F26]">
                {view.node.title}
            </span>
            <Handle
                type="source"
                position={Position.Bottom}
                className="opacity-0"
            />
        </div>
    );
}
