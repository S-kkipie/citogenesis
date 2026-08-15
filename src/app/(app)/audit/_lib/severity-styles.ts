import type { NodeSeverity, NodeShape } from "@/core/run/client/graph-view";

export const SEVERITY_RING: Record<NodeSeverity, string> = {
    flagged: "border-[#CF222E] text-[#CF222E]",
    caution: "border-[#9A6700] text-[#9A6700]",
    healthy: "border-[#1A7F37] text-[#1A7F37]",
    neutral: "border-[#57606A] text-[#1A1F26]",
};

export const SEVERITY_FILL: Record<NodeSeverity, string> = {
    flagged: "bg-[#CF222E]",
    caution: "bg-[#9A6700]",
    healthy: "bg-[#1A7F37]",
    neutral: "bg-white",
};

// solid = filled disc; ring = hollow; dashed = hollow + dashed border
export const SHAPE_CLASS: Record<NodeShape, string> = {
    solid: "border-2",
    ring: "border-2 bg-white",
    dashed: "border-2 border-dashed bg-white",
};
