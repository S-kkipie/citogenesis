import type { CitationNode, WorkId } from "../run/domain/graph";
import type { HttpOpts } from "./clients/http";

export interface FetchedWork {
    node: CitationNode;
    referencedWorks: WorkId[];
    topicIds: string[];
}
export interface OpenAlexOpts {
    mailto?: string;
    http?: HttpOpts;
}
