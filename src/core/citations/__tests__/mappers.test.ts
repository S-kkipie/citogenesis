import { describe, expect, it } from "vitest";
import { mapOpenAlexWork, reconstructAbstract, toWorkId } from "../mappers";

describe("toWorkId", () => {
    it("strips the OpenAlex url prefix", () => {
        expect(toWorkId("https://openalex.org/W123")).toBe("W123");
        expect(toWorkId("W456")).toBe("W456");
    });
});

describe("reconstructAbstract", () => {
    it("rebuilds text from an inverted index", () => {
        expect(reconstructAbstract({ Hello: [0], world: [1] })).toBe(
            "Hello world",
        );
    });
    it("returns null for missing index", () => {
        expect(reconstructAbstract(null)).toBeNull();
    });
});

describe("mapOpenAlexWork", () => {
    it("maps raw OpenAlex JSON into a resolved CitationNode + refs + topics", () => {
        const raw = {
            id: "https://openalex.org/W1",
            title: "A study",
            publication_year: 2001,
            doi: "https://doi.org/10.1/x",
            type: "article",
            primary_location: { source: { display_name: "Nature" } },
            authorships: [{ author: { display_name: "Ada L." } }],
            abstract_inverted_index: { Big: [0], claim: [1] },
            cited_by_count: 42,
            is_retracted: false,
            best_oa_location: { pdf_url: "http://oa/x.pdf" },
            referenced_works: [
                "https://openalex.org/W2",
                "https://openalex.org/W3",
            ],
            topics: [
                { id: "https://openalex.org/T10" },
                { id: "https://openalex.org/T11" },
            ],
        };
        const fw = mapOpenAlexWork(raw as never);
        expect(fw.node.id).toBe("W1");
        expect(fw.node.venue).toBe("Nature");
        expect(fw.node.authors).toEqual(["Ada L."]);
        expect(fw.node.abstract).toBe("Big claim");
        expect(fw.node.oaUrl).toBe("http://oa/x.pdf");
        expect(fw.node.fetchStatus).toBe("resolved");
        expect(fw.node.source).toBe("openalex");
        expect(fw.referencedWorks).toEqual(["W2", "W3"]);
        expect(fw.topicIds).toEqual(["T10", "T11"]);
    });
});
