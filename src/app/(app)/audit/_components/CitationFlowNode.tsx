"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { motion } from "motion/react";
import type { NodeView } from "@/core/run/client/graph-view";
import {
    SEVERITY_FILL,
    SEVERITY_RING,
    SHAPE_CLASS,
} from "../_lib/severity-styles";

export type CitationNodeData = {
    view: NodeView;
    /** 0–1 share of the graph's peak in-degree. Drives the dot's size. */
    weight?: number;
    /** Labelling every node at this scale is noise; only key ones name themselves. */
    showLabel?: boolean;
};
export type CitationRFNode = Node<CitationNodeData, "citation">;

const MIN_SIZE = 10;
const MAX_SIZE = 34;

export function CitationFlowNode({ data }: NodeProps<CitationRFNode>) {
    const { view, weight = 0, showLabel = false } = data;
    const filled = view.shape === "solid";
    // sqrt so a hub with 10× the citations reads as ~3× the dot, not 10×.
    const size = MIN_SIZE + Math.sqrt(weight) * (MAX_SIZE - MIN_SIZE);
    const emphasised = view.isOrigin || view.severity === "flagged";

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
                    delay: view.node.depth * 0.18,
                    duration: 0.42,
                    ease: [0.16, 1, 0.3, 1],
                }}
                style={{ width: size, height: size }}
                className={[
                    "rounded-full",
                    SHAPE_CLASS[view.shape],
                    SEVERITY_RING[view.severity],
                    filled ? SEVERITY_FILL[view.severity] : "",
                    view.inCycle ? "animate-pulse" : "",
                    view.isOrigin ? "ring-2 ring-offset-2" : "",
                ].join(" ")}
                title={`${view.node.title}${
                    view.pathogens.length
                        ? ` — ${view.pathogens.join(", ")}`
                        : ""
                }`}
            />
            {showLabel ? (
                <span
                    className={[
                        "max-w-[9rem] truncate text-[10px] leading-tight",
                        emphasised
                            ? "font-medium text-[var(--au-canvas-ink)]"
                            : "text-[var(--au-canvas-ink)] opacity-70",
                    ].join(" ")}
                >
                    {view.node.title}
                </span>
            ) : null}
            <Handle
                type="source"
                position={Position.Bottom}
                className="opacity-0"
            />
        </div>
    );
}
