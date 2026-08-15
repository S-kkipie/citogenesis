import type Graph from "graphology";
import type {
    EdgeView,
    GraphView,
    NodeSeverity,
} from "@/core/run/client/graph-view";
import { radialLayout } from "./radial-layout";

/**
 * Visual constants for the Sigma canvas. Moved here from CitationGraph so
 * the graph-instance sync is a pure, headless-testable function.
 */
export const SEVERITY_COLOR: Record<NodeSeverity, string> = {
    flagged: "#CF222E",
    caution: "#9A6700",
    healthy: "#1A7F37",
    neutral: "#8C959F",
};

const EDGE_PLAIN = "#D0D7DE";
const EDGE_SUPPORT = "#57606A";
const EDGE_CYCLE = "#CF222E";

/** Full paper titles run long enough to cover the canvas. */
const LABEL_MAX = 46;
const truncate = (title: string) =>
    title.length > LABEL_MAX ? `${title.slice(0, LABEL_MAX - 1)}…` : title;

const MIN_SIZE = 3;
const MAX_SIZE = 16;

const edgeAttrs = (ev: EdgeView) => ({
    size: ev.kind === "cycle" ? 2.5 : ev.kind === "support-path" ? 1.6 : 0.6,
    color:
        ev.kind === "cycle"
            ? EDGE_CYCLE
            : ev.kind === "support-path"
              ? EDGE_SUPPORT
              : EDGE_PLAIN,
    kind: ev.kind,
});

/**
 * Make the graphology instance mirror the view: merge attributes into
 * existing nodes/edges, add new ones, drop the gone. Positions come from
 * radialLayout on the full view each call — the layout is deterministic by
 * depth, so existing nodes only shift within their ring as siblings arrive.
 */
export function syncGraph(g: Graph, view: GraphView): void {
    const placed = radialLayout(view);

    // In-degree stands in for how load-bearing a paper is.
    const inDegree = new Map<string, number>();
    for (const ev of view.edges) {
        inDegree.set(ev.edge.to, (inDegree.get(ev.edge.to) ?? 0) + 1);
    }
    const maxIn = Math.max(1, ...inDegree.values());

    const keepNodes = new Set<string>();
    for (const nv of view.nodes) {
        keepNodes.add(nv.node.id);
        const at = placed.get(nv.node.id);
        const cited = inDegree.get(nv.node.id) ?? 0;
        const colour = SEVERITY_COLOR[nv.severity];
        const solid = nv.shape === "solid";
        // sqrt so a hub with 10x the citations reads as ~3x the dot.
        const size =
            MIN_SIZE +
            Math.sqrt(cited / maxIn) * (MAX_SIZE - MIN_SIZE) +
            (nv.isOrigin ? 4 : 0);

        g.mergeNode(nv.node.id, {
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
    for (const id of g.nodes()) {
        if (!keepNodes.has(id)) g.dropNode(id);
    }

    const keepEdges = new Set<string>();
    for (const ev of view.edges) {
        if (!g.hasNode(ev.edge.from) || !g.hasNode(ev.edge.to)) continue;
        keepEdges.add(ev.id);
        if (g.hasEdge(ev.id)) {
            g.mergeEdgeAttributes(ev.id, edgeAttrs(ev));
        } else {
            g.addEdgeWithKey(ev.id, ev.edge.from, ev.edge.to, edgeAttrs(ev));
        }
    }
    for (const id of g.edges()) {
        if (!keepEdges.has(id)) g.dropEdge(id);
    }
}
