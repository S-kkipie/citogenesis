import type { WorkId } from "../../run/domain/graph";
import type { RunError, RunInput } from "../../run/domain/state";
import type { TraceEmit } from "../../run/domain/trace";
import { getWorks } from "../clients/openalex";
import type { OpenAlexOpts } from "../types";
import { resolveClaim } from "./claim";
import { resolvePaper } from "./paper";
import { resolveWikipedia } from "./wikipedia";

export interface ResolveDeps {
    resolvePaper: typeof resolvePaper;
    resolveClaim: typeof resolveClaim;
    resolveWikipedia: typeof resolveWikipedia;
    getWorks: typeof getWorks;
}
const DEFAULTS: ResolveDeps = {
    resolvePaper,
    resolveClaim,
    resolveWikipedia,
    getWorks,
};

export async function resolveInputWith(
    input: RunInput,
    emit: TraceEmit,
    opts: OpenAlexOpts,
    deps: Partial<ResolveDeps> = {},
): Promise<{ claim: string; anchors: WorkId[]; errors: RunError[] }> {
    const d = { ...DEFAULTS, ...deps };
    emit({
        agent: "input-adapter",
        phase: "start",
        summary: `Resolving ${input.kind} input`,
    });

    let claim = "";
    let anchors: WorkId[] = [];
    const errors: RunError[] = [];

    switch (input.kind) {
        case "claim": {
            const r = await d.resolveClaim(input.text, emit, opts);
            claim = input.text;
            anchors = r.anchors;
            errors.push(...r.errors);
            break;
        }
        case "paper": {
            const workId = await d.resolvePaper(input.id, opts);
            if (!workId)
                throw new Error(`Could not resolve paper: ${input.id}`);
            anchors = [workId];
            const { works } = await d.getWorks([workId], opts);
            claim = works.get(workId)?.node.title ?? input.id;
            break;
        }
        case "wikipedia": {
            const r = await d.resolveWikipedia(
                input.url,
                input.statement,
                emit,
                opts,
            );
            claim = r.claim;
            anchors = r.anchors;
            errors.push(...r.errors);
            break;
        }
    }

    emit({
        agent: "input-adapter",
        phase: "handoff",
        summary: `Anchored to ${anchors.length} work(s)`,
        data: { anchors },
    });
    return { claim, anchors, errors };
}
