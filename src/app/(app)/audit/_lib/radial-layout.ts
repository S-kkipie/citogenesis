import type { GraphView } from "@/core/run/client/graph-view";

export type Placed = { id: string; x: number; y: number; angle: number };

/** Ring radius per depth. Rings widen as they go out so the outer, more
 * crowded ones get the circumference they need. */
const RADIUS = [0, 320, 620, 900, 1180];
const radiusFor = (depth: number) =>
    RADIUS[depth] ??
    RADIUS[RADIUS.length - 1] + (depth - RADIUS.length + 1) * 280;

/**
 * Radial tree layout: the anchor sits at the centre and each citation depth
 * forms a ring around it. Children are placed inside the angular wedge of the
 * parent that first reached them, so edges read as spokes fanning outward
 * rather than as a mesh of long crossing lines.
 *
 * A grid keyed on depth cannot do this — it ignores which node cites which,
 * so every edge becomes an arbitrary diagonal. Here the geometry carries the
 * citation structure, which is the whole point of drawing the graph.
 */
export function radialLayout(view: GraphView): Map<string, Placed> {
    const placed = new Map<string, Placed>();
    if (view.nodes.length === 0) return placed;

    const byDepth = new Map<number, string[]>();
    const depthOf = new Map<string, number>();
    for (const nv of view.nodes) {
        const d = nv.node.depth;
        depthOf.set(nv.node.id, d);
        const bucket = byDepth.get(d);
        if (bucket) bucket.push(nv.node.id);
        else byDepth.set(d, [nv.node.id]);
    }

    // parent = the shallower endpoint of the first edge that reaches a node.
    const parentOf = new Map<string, string>();
    for (const ev of view.edges) {
        const from = depthOf.get(ev.edge.from);
        const to = depthOf.get(ev.edge.to);
        if (from === undefined || to === undefined) continue;
        const [parent, child] =
            from < to ? [ev.edge.from, ev.edge.to] : [ev.edge.to, ev.edge.from];
        if (from !== to && !parentOf.has(child)) parentOf.set(child, parent);
    }

    const depths = [...byDepth.keys()].sort((a, b) => a - b);

    // Centre ring: place evenly around the origin (or dead centre if alone).
    const roots = byDepth.get(depths[0]) ?? [];
    roots.forEach((id, i) => {
        if (roots.length === 1) {
            placed.set(id, { id, x: 0, y: 0, angle: 0 });
            return;
        }
        const angle = (i / roots.length) * Math.PI * 2;
        const r = radiusFor(depths[0]);
        placed.set(id, {
            id,
            x: Math.cos(angle) * r,
            y: Math.sin(angle) * r,
            angle,
        });
    });

    for (const depth of depths.slice(1)) {
        const ids = byDepth.get(depth) ?? [];

        // Group by parent so siblings land together, and sort the groups by
        // the parent's angle — that keeps the ring in the same rotational
        // order as the ring inside it, so spokes don't cross.
        const groups = new Map<string, string[]>();
        for (const id of ids) {
            const key = parentOf.get(id) ?? "__orphan";
            const g = groups.get(key);
            if (g) g.push(id);
            else groups.set(key, [id]);
        }
        const ordered = [...groups.entries()].sort(
            ([a], [b]) =>
                (placed.get(a)?.angle ?? Math.PI * 4) -
                (placed.get(b)?.angle ?? Math.PI * 4),
        );

        const r = radiusFor(depth);
        const total = ids.length;
        let cursor = 0;
        for (const [parentId, children] of ordered) {
            // Each group gets a wedge proportional to its size, centred on the
            // parent's own angle where there is one.
            const span = (children.length / total) * Math.PI * 2;
            const parentAngle = placed.get(parentId)?.angle;
            const start =
                parentAngle === undefined ? cursor : parentAngle - span / 2;
            children.forEach((id, i) => {
                const angle = start + ((i + 0.5) / children.length) * span;
                placed.set(id, {
                    id,
                    x: Math.cos(angle) * r,
                    y: Math.sin(angle) * r,
                    angle,
                });
            });
            cursor += span;
        }
    }

    return placed;
}
