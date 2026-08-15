import { ServerConfig } from "@/config/server-config";
import type { ResolveInput, TraceChain } from "../run/domain/ports";
import { getWorks } from "./clients/openalex";
import { resolveInputWith } from "./resolve";
import { type TraceBudgetInput, traceChainWith } from "./trace/bfs";
import type { OpenAlexOpts } from "./types";

const liveOpts: OpenAlexOpts = { mailto: ServerConfig.openAlexMailto };

export const resolveInput: ResolveInput = (input, emit) =>
    resolveInputWith(input, emit, liveOpts);

export const traceChain = ((
    anchors: Parameters<TraceChain>[0],
    budget: TraceBudgetInput,
    emit: Parameters<TraceChain>[2],
    emitDelta?: Parameters<TraceChain>[3],
) =>
    traceChainWith(
        anchors,
        budget,
        emit,
        (ids) => getWorks(ids, liveOpts),
        emitDelta,
    )) satisfies TraceChain;
