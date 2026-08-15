import { ServerConfig } from "@/config/server-config";
import type { ResolveInput, TraceChain } from "../run/domain/ports";
import { getWorks } from "./clients/openalex";
import { resolveInputWith } from "./resolve";
import { traceChainWith } from "./trace/bfs";
import type { OpenAlexOpts } from "./types";

const liveOpts: OpenAlexOpts = { mailto: ServerConfig.openAlexMailto };

export const resolveInput: ResolveInput = (input, emit) =>
  resolveInputWith(input, emit, liveOpts);

export const traceChain: TraceChain = (anchors, budget, emit) =>
  traceChainWith(anchors, budget, emit, (ids) => getWorks(ids, liveOpts));
