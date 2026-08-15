# LLM Agents (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three Gemini-backed ports (`JudgePrimacy`, `AuditDrift`, `WriteVerdict`) plus a Gemini wrapper and a drift benchmark, under `src/core/agents/**`.

**Architecture:** A thin dependency-injected Gemini wrapper (`callStructured`, `uploadPdf`) does every model call with schema validation + one repair retry + mark-and-continue. Three port impls consume the shared `src/core/run/domain` contracts and never touch them. All scoring is a pure deterministic function; the LLM only writes prose. Pure logic (heuristics, origin-select, scorer) is built and tested before any LLM-touching code.

**Tech Stack:** TypeScript (ESM), `@google/genai@2.17.1`, `zod@4` (`z.toJSONSchema`), Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-15-llm-agents-design.md`

## Global Constraints

- Owned tree: `src/core/agents/**` only. Never edit `src/core/run/domain/**`, `src/core/run/server/graph.ts`, or another part's files. Contract change needed → message the orchestrator.
- Consume contracts from `@/core/run/domain` (barrel): `CitationGraph`, `CitationNode`, `WorkId`, `Primacy`, `DriftFinding`, `Verdict`, `Pathogen`, `RunError`, `TraceEmit`, `AgentName`, port types `JudgePrimacy`/`AuditDrift`/`WriteVerdict`.
- Models locked: Primacy = `gemini-3.5-flash-lite`; Drift + Verdict = `gemini-3.6-flash`; `gemini-3.1-pro` only via benchmark outcome. Define these as consts, do not hardcode elsewhere.
- API key: `ServerConfig.geminiApiKey` (from `@/config/server-config`). Never read `process.env` directly.
- Ports return `errors: RunError[]` for recovered failures and **throw only on unrecoverable**. Recovered failure = `RunError{ agent, message, recovered: true }`.
- Every port calls `emit` on start / progress / handoff / recovery / done. Agent names: `primacy-judge`, `drift-auditor`, `verdict`.
- Import alias `@/` = `src/`. Test files: `**/__tests__/*.test.ts` (Vitest, matches existing repo pattern). Run a single test file with `pnpm vitest run <path>`.
- TDD: failing test first, minimal impl, green, commit. Conventional Commits. Co-author trailer on every commit:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

**Precondition:** in the worktree run `pnpm install` once (node_modules is not shared across worktrees) before Task 1.

---

### Task 1: Gemini client + `callStructured` wrapper

**Files:**
- Create: `src/core/agents/gemini/client.ts`
- Create: `src/core/agents/gemini/errors.ts`
- Create: `src/core/agents/gemini/schema.ts`
- Create: `src/core/agents/gemini/call-structured.ts`
- Test: `src/core/agents/gemini/__tests__/call-structured.test.ts`

**Interfaces:**
- Consumes: `ServerConfig.geminiApiKey`; `AgentName`, `TraceEmit` from `@/core/run/domain`.
- Produces:
  - `getGenAI(): GoogleGenAI` (memoized singleton).
  - `class AgentSchemaError extends Error { agent: AgentName; lastError: string }`.
  - `toGeminiSchema(schema: z.ZodType): unknown` — `z.toJSONSchema` with `$schema` stripped.
  - `type CallDeps = { ai: Pick<GoogleGenAI, "models"> }`.
  - `callStructured<T>(opts: { model: string; system?: string; contents: ContentListUnion; schema: z.ZodType<T>; agent: AgentName; emit: TraceEmit; label: string }, deps?: CallDeps): Promise<{ data: T; usage: { prompt: number; output: number; total: number }; latencyMs: number }>`

- [ ] **Step 1: Write the client + errors + schema helpers**

`src/core/agents/gemini/client.ts`:
```ts
import { GoogleGenAI } from "@google/genai";
import { ServerConfig } from "@/config/server-config";

let cached: GoogleGenAI | undefined;

/** Memoized GoogleGenAI singleton keyed off the server config. */
export function getGenAI(): GoogleGenAI {
    if (!cached) cached = new GoogleGenAI({ apiKey: ServerConfig.geminiApiKey });
    return cached;
}

export const MODELS = {
    primacy: "gemini-3.5-flash-lite",
    drift: "gemini-3.6-flash",
    verdict: "gemini-3.6-flash",
    driftFallback: "gemini-3.1-pro",
} as const;
```

`src/core/agents/gemini/errors.ts`:
```ts
import type { AgentName, RunError } from "@/core/run/domain";

/** Thrown after a model call fails schema validation twice. Callers catch it,
 * record a recovered RunError, and mark-and-continue. */
export class AgentSchemaError extends Error {
    constructor(
        readonly agent: AgentName,
        readonly lastError: string,
    ) {
        super(`[${agent}] schema validation failed after retry: ${lastError}`);
        this.name = "AgentSchemaError";
    }
}

export function recoveredError(agent: AgentName, message: string): RunError {
    return { agent, message, recovered: true };
}
```

`src/core/agents/gemini/schema.ts`:
```ts
import { z } from "zod";

/** Gemini `responseJsonSchema` accepts a JSON Schema but rejects the `$schema`
 * meta key. Convert a Zod schema and strip it. */
export function toGeminiSchema(schema: z.ZodType): unknown {
    const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
    delete json.$schema;
    return json;
}
```

- [ ] **Step 2: Write the failing test**

`src/core/agents/gemini/__tests__/call-structured.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentSchemaError } from "../errors";
import { callStructured } from "../call-structured";

const schema = z.object({ ok: z.boolean() });
const emit = () => {};

/** Build a fake `ai` whose generateContent returns the queued texts in order. */
function fakeAI(texts: string[]) {
    const generateContent = vi.fn(async () => {
        const text = texts.shift();
        return { text, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 } };
    });
    return { deps: { ai: { models: { generateContent } } }, generateContent };
}

const base = { model: "m", contents: "hi", schema, agent: "verdict" as const, emit, label: "t" };

describe("callStructured", () => {
    it("parses and validates a good response", async () => {
        const { deps } = fakeAI(['{"ok":true}']);
        const { data, usage } = await callStructured(base, deps);
        expect(data).toEqual({ ok: true });
        expect(usage.total).toBe(3);
    });

    it("retries once on invalid JSON, then succeeds", async () => {
        const { deps, generateContent } = fakeAI(["not json", '{"ok":false}']);
        const { data } = await callStructured(base, deps);
        expect(data).toEqual({ ok: false });
        expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it("throws AgentSchemaError after two failures", async () => {
        const { deps } = fakeAI(["nope", "still nope"]);
        await expect(callStructured(base, deps)).rejects.toBeInstanceOf(AgentSchemaError);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/gemini/__tests__/call-structured.test.ts`
Expected: FAIL — `callStructured` not exported.

- [ ] **Step 4: Implement `call-structured.ts`**

```ts
import type { ContentListUnion, GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import type { AgentName, TraceEmit } from "@/core/run/domain";
import { getGenAI } from "./client";
import { AgentSchemaError } from "./errors";
import { toGeminiSchema } from "./schema";

export type CallDeps = { ai: Pick<GoogleGenAI, "models"> };

export interface CallStructuredOpts<T> {
    model: string;
    system?: string;
    contents: ContentListUnion;
    schema: z.ZodType<T>;
    agent: AgentName;
    emit: TraceEmit;
    label: string;
}

export interface CallResult<T> {
    data: T;
    usage: { prompt: number; output: number; total: number };
    latencyMs: number;
}

const isTransient = (e: unknown) => {
    const s = (e as { status?: number })?.status ?? 0;
    return s === 429 || (s >= 500 && s < 600);
};

async function generateWithBackoff(
    ai: Pick<GoogleGenAI, "models">,
    req: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await ai.models.generateContent(req);
        } catch (e) {
            lastErr = e;
            if (!isTransient(e)) throw e;
            await new Promise((r) => setTimeout(r, 2 ** attempt * 250));
        }
    }
    throw lastErr;
}

export async function callStructured<T>(
    opts: CallStructuredOpts<T>,
    deps: CallDeps = { ai: getGenAI() },
): Promise<CallResult<T>> {
    const { model, system, contents, schema, agent, emit, label } = opts;
    const started = performance.now();
    emit({ agent, phase: "start", summary: label, data: { model } });

    const config = {
        ...(system ? { systemInstruction: system } : {}),
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiSchema(schema),
    };

    let contentsToSend: ContentListUnion = contents;
    let lastError = "";

    for (let attempt = 0; attempt < 2; attempt++) {
        const res = await generateWithBackoff(deps.ai, { model, contents: contentsToSend, config });
        const raw = res.text ?? "";
        try {
            const data = schema.parse(JSON.parse(raw));
            const u = res.usageMetadata;
            emit({ agent, phase: "done", summary: label });
            return {
                data,
                usage: {
                    prompt: u?.promptTokenCount ?? 0,
                    output: u?.candidatesTokenCount ?? 0,
                    total: u?.totalTokenCount ?? 0,
                },
                latencyMs: Math.round(performance.now() - started),
            };
        } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
            if (attempt === 0) {
                emit({ agent, phase: "recovery", summary: `${label}: schema retry`, data: { lastError } });
                contentsToSend = [
                    { role: "user", parts: [{ text: String(contents) }] },
                    { role: "model", parts: [{ text: raw }] },
                    { role: "user", parts: [{ text: `Your previous output failed validation: ${lastError}. Return corrected JSON only, matching the schema.` }] },
                ];
            }
        }
    }
    emit({ agent, phase: "error", summary: `${label}: schema failed`, data: { lastError } });
    throw new AgentSchemaError(agent, lastError);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/gemini/__tests__/call-structured.test.ts`
Expected: PASS (3 tests). Then `pnpm biome check --write src/core/agents/gemini`.

- [ ] **Step 6: Commit**

```bash
git add src/core/agents/gemini
git commit -m "feat(agents): Gemini callStructured wrapper with schema retry"
```

---

### Task 2: `uploadPdf` (File API)

**Files:**
- Create: `src/core/agents/gemini/upload-pdf.ts`
- Test: `src/core/agents/gemini/__tests__/upload-pdf.test.ts`

**Interfaces:**
- Consumes: `getGenAI`.
- Produces: `uploadPdf(url: string, deps?: UploadDeps): Promise<Part | null>` where `UploadDeps = { ai: Pick<GoogleGenAI,"files">; fetch: typeof fetch }`. Returns a Gemini file `Part`, or `null` when the URL is missing, non-PDF, too large (> 20 MB), or the fetch/upload fails.

- [ ] **Step 1: Write the failing test**

`src/core/agents/gemini/__tests__/upload-pdf.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { uploadPdf } from "../upload-pdf";

function deps(res: Partial<Response> | Error, uploaded = { uri: "files/x", mimeType: "application/pdf" }) {
    const fetch = vi.fn(async () => {
        if (res instanceof Error) throw res;
        return res as Response;
    });
    const upload = vi.fn(async () => uploaded);
    return { d: { ai: { files: { upload } }, fetch }, upload };
}

const pdfResponse = {
    headers: new Headers({ "content-type": "application/pdf", "content-length": "1000" }),
    blob: async () => new Blob([new Uint8Array(1000)], { type: "application/pdf" }),
} as unknown as Response;

describe("uploadPdf", () => {
    it("uploads a PDF and returns a file part", async () => {
        const { d, upload } = deps(pdfResponse);
        const part = await uploadPdf("http://x/y.pdf", d as never);
        expect(upload).toHaveBeenCalledOnce();
        expect(part).toMatchObject({ fileData: { fileUri: "files/x" } });
    });

    it("returns null for a non-PDF content-type", async () => {
        const html = { headers: new Headers({ "content-type": "text/html" }), blob: async () => new Blob() } as unknown as Response;
        const { d } = deps(html);
        expect(await uploadPdf("http://x/landing", d as never)).toBeNull();
    });

    it("returns null when fetch throws", async () => {
        const { d } = deps(new Error("network"));
        expect(await uploadPdf("http://x/y.pdf", d as never)).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/gemini/__tests__/upload-pdf.test.ts`
Expected: FAIL — `uploadPdf` not exported.

- [ ] **Step 3: Implement `upload-pdf.ts`**

```ts
import { createPartFromUri, type GoogleGenAI, type Part } from "@google/genai";
import { getGenAI } from "./client";

export type UploadDeps = { ai: Pick<GoogleGenAI, "files">; fetch: typeof fetch };
const MAX_BYTES = 20 * 1024 * 1024;

/** Fetch a PDF from `url` and upload it via the Files API. Returns a file part,
 * or null when the URL is not a usable PDF (caller falls back to the abstract). */
export async function uploadPdf(
    url: string,
    deps: UploadDeps = { ai: getGenAI(), fetch },
): Promise<Part | null> {
    try {
        const res = await deps.fetch(url);
        const type = res.headers.get("content-type") ?? "";
        const len = Number(res.headers.get("content-length") ?? "0");
        const looksPdf = type.includes("application/pdf") || url.toLowerCase().endsWith(".pdf");
        if (!looksPdf || len > MAX_BYTES) return null;
        const blob = await res.blob();
        if (blob.size > MAX_BYTES) return null;
        const file = await deps.ai.files.upload({ file: blob, config: { mimeType: "application/pdf" } });
        if (!file.uri) return null;
        return createPartFromUri(file.uri, file.mimeType ?? "application/pdf");
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/gemini/__tests__/upload-pdf.test.ts`
Expected: PASS (3 tests). Then Biome.

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/gemini/upload-pdf.ts src/core/agents/gemini/__tests__/upload-pdf.test.ts
git commit -m "feat(agents): uploadPdf File API helper with fallback to null"
```

---

### Task 3: Origin selection (pure)

**Files:**
- Create: `src/core/agents/primacy/origin-select.ts`
- Test: `src/core/agents/primacy/__tests__/origin-select.test.ts`

**Interfaces:**
- Consumes: `CitationGraph`, `CitationNode`, `WorkId`.
- Produces: `selectOrigins(graph: CitationGraph, limit = 3): WorkId[]` — chain-root sinks ranked by in-graph fan-in → `citedByCount` → has-`oaUrl`.

- [ ] **Step 1: Write the failing test**

`src/core/agents/primacy/__tests__/origin-select.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { CitationGraph, CitationNode } from "@/core/run/domain";
import { selectOrigins } from "../origin-select";

const node = (id: string, over: Partial<CitationNode> = {}): CitationNode => ({
    id, title: id, year: 2020, doi: null, type: "article", venue: null, authors: [],
    abstract: null, citedByCount: 0, isRetracted: false, oaUrl: null, depth: 1,
    source: "openalex", fetchStatus: "resolved", ...over,
});

// A,B,C cite ORIGIN (sink). D cites A only.
const graph: CitationGraph = {
    nodes: [node("W1"), node("W2"), node("W3"), node("WORIGIN"), node("WLEAF")],
    edges: [
        { from: "W1", to: "WORIGIN" }, { from: "W2", to: "WORIGIN" },
        { from: "W3", to: "WORIGIN" }, { from: "WLEAF", to: "W1" }, { from: "W1", to: "W2" },
    ],
    truncated: false,
};

describe("selectOrigins", () => {
    it("picks the highest fan-in sink first", () => {
        const origins = selectOrigins(graph, 3);
        expect(origins[0]).toBe("WORIGIN"); // 3 papers cite it, references nothing
    });

    it("caps at the limit", () => {
        expect(selectOrigins(graph, 1)).toHaveLength(1);
    });

    it("falls back to deepest nodes when the graph is fully cyclic", () => {
        const cyclic: CitationGraph = {
            nodes: [node("A", { depth: 1 }), node("B", { depth: 2 })],
            edges: [{ from: "A", to: "B" }, { from: "B", to: "A" }],
            truncated: false,
        };
        expect(selectOrigins(cyclic, 3).length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/primacy/__tests__/origin-select.test.ts`
Expected: FAIL — `selectOrigins` not exported.

- [ ] **Step 3: Implement `origin-select.ts`**

```ts
import type { CitationGraph, WorkId } from "@/core/run/domain";

/** Chain roots the support converges on. Edges are `from cites to`; a root is a
 * sink (out-degree 0 — references nothing else we traced). Rank by fan-in
 * (papers citing it), then citedByCount, then prefer nodes with OA full text. */
export function selectOrigins(graph: CitationGraph, limit = 3): WorkId[] {
    const outDeg = new Map<WorkId, number>();
    const inDeg = new Map<WorkId, number>();
    for (const n of graph.nodes) {
        outDeg.set(n.id, 0);
        inDeg.set(n.id, 0);
    }
    for (const e of graph.edges) {
        outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
        inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }
    const resolved = graph.nodes.filter((n) => n.fetchStatus === "resolved");
    let roots = resolved.filter((n) => (outDeg.get(n.id) ?? 0) === 0);
    if (roots.length === 0) {
        const maxDepth = Math.max(...resolved.map((n) => n.depth), 0);
        roots = resolved.filter((n) => n.depth === maxDepth);
    }
    return roots
        .sort(
            (a, b) =>
                (inDeg.get(b.id) ?? 0) - (inDeg.get(a.id) ?? 0) ||
                b.citedByCount - a.citedByCount ||
                Number(!!b.oaUrl) - Number(!!a.oaUrl),
        )
        .slice(0, limit)
        .map((n) => n.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/primacy/__tests__/origin-select.test.ts`
Expected: PASS (3 tests). Then Biome.

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/primacy/origin-select.ts src/core/agents/primacy/__tests__/origin-select.test.ts
git commit -m "feat(agents): pure origin (chain-root) selection"
```

---

### Task 4: Verdict scorer (pure) — highest value

**Files:**
- Create: `src/core/agents/verdict/score.ts`
- Test: `src/core/agents/verdict/__tests__/score.test.ts`

**Interfaces:**
- Consumes: `CitationGraph`, `DriftFinding`, `WorkId`, `Pathogen`; `selectOrigins` (Task 3).
- Produces: `scoreVerdict(args: { graph: CitationGraph; cycles: WorkId[][]; driftFindings: DriftFinding[] }): { confidence: "LOW"|"MEDIUM"|"HIGH"; score: number; pathogens: Pathogen[]; primaryRatio: number; coverage: { resolved: number; total: number } }`.

- [ ] **Step 1: Write the failing test**

`src/core/agents/verdict/__tests__/score.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { CitationGraph, CitationNode, DriftFinding } from "@/core/run/domain";
import { scoreVerdict } from "../score";

const node = (id: string, over: Partial<CitationNode> = {}): CitationNode => ({
    id, title: id, year: 2020, doi: null, type: "article", venue: null, authors: [],
    abstract: null, citedByCount: 0, isRetracted: false, oaUrl: null, depth: 1,
    source: "openalex", fetchStatus: "resolved",
    primacy: { label: "primary", method: "heuristic" }, ...over,
});
const g = (nodes: CitationNode[], edges: CitationGraph["edges"] = []): CitationGraph => ({ nodes, edges, truncated: false });
const drift = (over: Partial<DriftFinding> = {}): DriftFinding => ({ workId: "W1", label: "supported", evidenceQuote: null, explanation: "x", basis: "fulltext", ...over });

describe("scoreVerdict", () => {
    it("gates to LOW on contradicted drift", () => {
        const r = scoreVerdict({ graph: g([node("W1")]), cycles: [], driftFindings: [drift({ label: "contradicted" })] });
        expect(r.confidence).toBe("LOW");
        expect(r.score).toBeLessThanOrEqual(20);
        expect(r.pathogens).toContain("claim-drift");
    });

    it("gates to LOW on a cycle", () => {
        const r = scoreVerdict({ graph: g([node("W1")]), cycles: [["W1", "W2", "W1"]], driftFindings: [] });
        expect(r.confidence).toBe("LOW");
        expect(r.pathogens).toContain("circular-support");
    });

    it("gates to LOW when no origin is primary (no-primary-source)", () => {
        const r = scoreVerdict({ graph: g([node("W1", { primacy: { label: "secondary", method: "heuristic" } })]), cycles: [], driftFindings: [] });
        expect(r.confidence).toBe("LOW");
        expect(r.pathogens).toContain("no-primary-source");
    });

    it("gates to LOW on a retracted node", () => {
        const r = scoreVerdict({ graph: g([node("W1", { isRetracted: true })]), cycles: [], driftFindings: [] });
        expect(r.confidence).toBe("LOW");
    });

    it("clean primary chain, supported drift → HIGH", () => {
        const r = scoreVerdict({ graph: g([node("W1"), node("W2")]), cycles: [], driftFindings: [drift({ label: "supported" })] });
        expect(r.confidence).toBe("HIGH");
        expect(r.score).toBeGreaterThanOrEqual(70);
        expect(r.pathogens).toEqual([]);
    });

    it("a lone drifted finding lands MEDIUM (not gated)", () => {
        const r = scoreVerdict({ graph: g([node("W1"), node("W2")]), cycles: [], driftFindings: [drift({ label: "drifted" })] });
        expect(r.confidence).toBe("MEDIUM");
        expect(r.pathogens).toContain("claim-drift");
    });

    it("reports coverage and primaryRatio", () => {
        const nodes = [node("W1"), node("W2", { primacy: { label: "secondary", method: "llm" } }), node("W3", { fetchStatus: "unresolved", primacy: undefined })];
        const r = scoreVerdict({ graph: g(nodes), cycles: [], driftFindings: [drift()] });
        expect(r.coverage).toEqual({ resolved: 2, total: 3 });
        expect(r.primaryRatio).toBeCloseTo(0.5); // 1 primary of 2 labeled
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/verdict/__tests__/score.test.ts`
Expected: FAIL — `scoreVerdict` not exported.

- [ ] **Step 3: Implement `score.ts`**

```ts
import type { CitationGraph, DriftFinding, Pathogen, WorkId } from "@/core/run/domain";
import { selectOrigins } from "@/core/agents/primacy/origin-select";

const DRIFT_RANK = { supported: 0, "partially-supported": 1, drifted: 2, contradicted: 3 } as const;
const DRIFT_PENALTY = { supported: 0, "partially-supported": 20, drifted: 40, contradicted: 0 } as const;

export interface ScoreArgs {
    graph: CitationGraph;
    cycles: WorkId[][];
    driftFindings: DriftFinding[];
}
export interface ScoreResult {
    confidence: "LOW" | "MEDIUM" | "HIGH";
    score: number;
    pathogens: Pathogen[];
    primaryRatio: number;
    coverage: { resolved: number; total: number };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreVerdict({ graph, cycles, driftFindings }: ScoreArgs): ScoreResult {
    const nodes = graph.nodes;
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const labeled = nodes.filter((n) => n.primacy);
    const primary = labeled.filter((n) => n.primacy?.label === "primary");
    const primaryRatio = labeled.length ? primary.length / labeled.length : 0;
    const coverage = {
        resolved: nodes.filter((n) => n.fetchStatus === "resolved").length,
        total: nodes.length,
    };

    const origins = selectOrigins(graph).map((id) => byId.get(id)).filter((n) => n != null);
    const noPrimaryOrigin = origins.length > 0 && !origins.some((n) => n.primacy?.label === "primary");

    // fan-in per node (edges are from→to)
    const inDeg = new Map<WorkId, number>();
    for (const e of graph.edges) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    const spof =
        origins.length === 1 &&
        (inDeg.get(origins[0].id) ?? 0) >= 3 &&
        (origins[0].isRetracted || origins[0].type === "preprint");

    const worst = driftFindings.reduce(
        (acc, f) => (DRIFT_RANK[f.label] > DRIFT_RANK[acc] ? f.label : acc),
        "supported" as DriftFinding["label"],
    );

    const pathogens: Pathogen[] = [];
    if (cycles.length > 0) pathogens.push("circular-support");
    if (noPrimaryOrigin) pathogens.push("no-primary-source");
    if (spof) pathogens.push("single-point-of-failure");
    if (driftFindings.some((f) => f.label === "drifted" || f.label === "contradicted"))
        pathogens.push("claim-drift");

    const anyContradicted = driftFindings.some((f) => f.label === "contradicted");
    const anyRetracted = nodes.some((n) => n.isRetracted);
    const gated = anyContradicted || anyRetracted || cycles.length > 0 || noPrimaryOrigin;

    if (gated) {
        const penalty = (1 - primaryRatio) * 45 + (spof ? 25 : 0);
        return { confidence: "LOW", score: clamp(Math.min(20, 100 - penalty)), pathogens, primaryRatio, coverage };
    }

    const penalty = (1 - primaryRatio) * 45 + DRIFT_PENALTY[worst] + (spof ? 25 : 0);
    const score = clamp(100 - penalty);
    return { confidence: score >= 70 ? "HIGH" : "MEDIUM", score, pathogens, primaryRatio, coverage };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/verdict/__tests__/score.test.ts`
Expected: PASS (7 tests). Then Biome.

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/verdict/score.ts src/core/agents/verdict/__tests__/score.test.ts
git commit -m "feat(agents): deterministic hybrid verdict scorer"
```

---

### Task 5: Primacy heuristics (pure)

**Files:**
- Create: `src/core/agents/primacy/heuristics.ts`
- Test: `src/core/agents/primacy/__tests__/heuristics.test.ts`

**Interfaces:**
- Consumes: `Primacy` (label enum).
- Produces: `heuristicPrimacy(type: string): Primacy | null` — a `Primacy{method:"heuristic"}` for a confidently-routed OpenAlex `type`, or `null` when the node is ambiguous and must go to the LLM.

- [ ] **Step 1: Write the failing test**

`src/core/agents/primacy/__tests__/heuristics.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { heuristicPrimacy } from "../heuristics";

describe("heuristicPrimacy", () => {
    it.each(["review", "editorial", "letter", "erratum", "paratext", "book-review", "book", "report"])(
        "%s → secondary", (t) => {
            expect(heuristicPrimacy(t)).toEqual({ label: "secondary", method: "heuristic", rationale: expect.any(String) });
        },
    );
    it("dataset → primary", () => {
        expect(heuristicPrimacy("dataset")?.label).toBe("primary");
    });
    it.each(["article", "preprint", "other", "", "something-new"])("%s → null (LLM)", (t) => {
        expect(heuristicPrimacy(t)).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/primacy/__tests__/heuristics.test.ts`
Expected: FAIL — `heuristicPrimacy` not exported.

- [ ] **Step 3: Implement `heuristics.ts`**

```ts
import type { Primacy } from "@/core/run/domain";

const SECONDARY = new Set(["review", "editorial", "letter", "erratum", "paratext", "book-review", "book", "report"]);
const PRIMARY = new Set(["dataset"]);

/** Confidently route by OpenAlex `type`. Returns null for ambiguous types
 * (`article`, `preprint`, unknown) — those go to the LLM. */
export function heuristicPrimacy(type: string): Primacy | null {
    if (SECONDARY.has(type)) return { label: "secondary", method: "heuristic", rationale: `OpenAlex type '${type}' is a secondary source` };
    if (PRIMARY.has(type)) return { label: "primary", method: "heuristic", rationale: `OpenAlex type '${type}' is original data` };
    return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/primacy/__tests__/heuristics.test.ts`
Expected: PASS. Then Biome.

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/primacy/heuristics.ts src/core/agents/primacy/__tests__/heuristics.test.ts
git commit -m "feat(agents): primacy heuristic routing table"
```

---

### Task 6: PrimacyJudge port

**Files:**
- Create: `src/core/agents/primacy/prompt.ts`
- Create: `src/core/agents/primacy/judge-primacy.ts`
- Test: `src/core/agents/primacy/__tests__/judge-primacy.test.ts`

**Interfaces:**
- Consumes: `heuristicPrimacy` (Task 5), `selectOrigins` (Task 3), `callStructured` (Task 1), `MODELS`, `recoveredError`; contract `JudgePrimacy`, `CitationNode`, `TraceEmit`.
- Produces: `judgePrimacy: JudgePrimacy` and `type CallStructuredFn` injection point so tests avoid live calls: `makeJudgePrimacy(call: CallStructuredFn): JudgePrimacy`, with `judgePrimacy = makeJudgePrimacy(callStructured)`.
- Batch LLM output schema: `primacyBatchSchema = z.object({ results: z.array(z.object({ id: workIdSchema, label: primacyLabelSchema, rationale: z.string() })) })`.

- [ ] **Step 1: Write the prompt module**

`src/core/agents/primacy/prompt.ts`:
```ts
import { z } from "zod";
import { primacyLabelSchema, workIdSchema } from "@/core/run/domain";
import type { CitationNode } from "@/core/run/domain";

export const PRIMACY_SYSTEM =
    "You classify scientific works as PRIMARY (reports original data/experiments/analysis) " +
    "or SECONDARY (review, commentary, opinion, news, or summarizes others' work). " +
    "Use UNKNOWN only when the metadata is too thin to tell. Judge each work independently.";

export const primacyBatchSchema = z.object({
    results: z.array(z.object({ id: workIdSchema, label: primacyLabelSchema, rationale: z.string() })),
});
export type PrimacyBatch = z.infer<typeof primacyBatchSchema>;

export function buildPrimacyPrompt(nodes: CitationNode[]): string {
    const items = nodes.map((n) => ({
        id: n.id,
        title: n.title,
        type: n.type,
        venue: n.venue,
        year: n.year,
        abstract: n.abstract?.slice(0, 1500) ?? null,
    }));
    return `Classify each work. Return {"results":[{"id","label","rationale"}]} covering every id exactly once.\n\n${JSON.stringify(items, null, 2)}`;
}
```

- [ ] **Step 2: Write the failing test**

`src/core/agents/primacy/__tests__/judge-primacy.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { CitationGraph, CitationNode } from "@/core/run/domain";
import { makeJudgePrimacy } from "../judge-primacy";

const node = (id: string, type: string, over: Partial<CitationNode> = {}): CitationNode => ({
    id, title: id, year: 2020, doi: null, type, venue: null, authors: [], abstract: "a",
    citedByCount: 0, isRetracted: false, oaUrl: null, depth: 1, source: "openalex",
    fetchStatus: "resolved", ...over,
});
const emit = vi.fn();

describe("judgePrimacy", () => {
    it("labels via heuristics without calling the LLM", async () => {
        const call = vi.fn();
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = { nodes: [node("W1", "review"), node("W2", "dataset")], edges: [], truncated: false };
        const { nodes } = await judge(graph, emit);
        expect(call).not.toHaveBeenCalled();
        expect(nodes.find((n) => n.id === "W1")?.primacy).toMatchObject({ label: "secondary", method: "heuristic" });
        expect(nodes.find((n) => n.id === "W2")?.primacy?.label).toBe("primary");
    });

    it("sends ambiguous nodes to the LLM and stamps method:llm", async () => {
        const call = vi.fn(async () => ({ data: { results: [{ id: "W3", label: "primary", rationale: "orig data" }] }, usage: { prompt: 0, output: 0, total: 0 }, latencyMs: 1 }));
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = { nodes: [node("W3", "article")], edges: [], truncated: false };
        const { nodes } = await judge(graph, emit);
        expect(call).toHaveBeenCalledOnce();
        expect(nodes[0].primacy).toMatchObject({ label: "primary", method: "llm" });
    });

    it("marks ids missing from the LLM response as unknown + records a recovered error", async () => {
        const call = vi.fn(async () => ({ data: { results: [] }, usage: { prompt: 0, output: 0, total: 0 }, latencyMs: 1 }));
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = { nodes: [node("W4", "article")], edges: [], truncated: false };
        const { nodes, errors } = await judge(graph, emit);
        expect(nodes[0].primacy).toMatchObject({ label: "unknown", method: "llm" });
        expect(errors.some((e) => e.recovered)).toBe(true);
    });

    it("continues (unknown) when the LLM call throws", async () => {
        const call = vi.fn(async () => { throw new Error("boom"); });
        const judge = makeJudgePrimacy(call as never);
        const graph: CitationGraph = { nodes: [node("W5", "article")], edges: [], truncated: false };
        const { nodes, errors } = await judge(graph, emit);
        expect(nodes[0].primacy?.label).toBe("unknown");
        expect(errors.length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/primacy/__tests__/judge-primacy.test.ts`
Expected: FAIL — `makeJudgePrimacy` not exported.

- [ ] **Step 4: Implement `judge-primacy.ts`**

```ts
import type { CallResult } from "@/core/agents/gemini/call-structured";
import { callStructured } from "@/core/agents/gemini/call-structured";
import { MODELS } from "@/core/agents/gemini/client";
import { recoveredError } from "@/core/agents/gemini/errors";
import type { CitationNode, JudgePrimacy, RunError } from "@/core/run/domain";
import { heuristicPrimacy } from "./heuristics";
import { selectOrigins } from "./origin-select";
import { buildPrimacyPrompt, primacyBatchSchema, PRIMACY_SYSTEM } from "./prompt";

// biome-ignore lint/suspicious/noExplicitAny: injection seam for tests
type CallStructuredFn = (opts: any) => Promise<CallResult<any>>;
const BATCH = 50;

export function makeJudgePrimacy(call: CallStructuredFn): JudgePrimacy {
    return async (graph, emit) => {
        emit({ agent: "primacy-judge", phase: "start", summary: `labeling ${graph.nodes.length} nodes` });
        const errors: RunError[] = [];
        const out = new Map<string, CitationNode>();
        const ambiguous: CitationNode[] = [];

        for (const n of graph.nodes) {
            if (n.fetchStatus !== "resolved") { out.set(n.id, n); continue; }
            const h = heuristicPrimacy(n.type);
            if (h) out.set(n.id, { ...n, primacy: h });
            else { out.set(n.id, n); ambiguous.push(n); }
        }
        emit({ agent: "primacy-judge", phase: "progress", summary: `${graph.nodes.length - ambiguous.length} heuristic, ${ambiguous.length} to LLM` });

        for (let i = 0; i < ambiguous.length; i += BATCH) {
            const batch = ambiguous.slice(i, i + BATCH);
            try {
                const { data } = await call({
                    model: MODELS.primacy,
                    system: PRIMACY_SYSTEM,
                    contents: buildPrimacyPrompt(batch),
                    schema: primacyBatchSchema,
                    agent: "primacy-judge",
                    emit,
                    label: `primacy batch ${i / BATCH + 1}`,
                });
                const seen = new Set<string>();
                for (const r of data.results) {
                    const node = out.get(r.id);
                    if (node) { out.set(r.id, { ...node, primacy: { label: r.label, method: "llm", rationale: r.rationale } }); seen.add(r.id); }
                }
                for (const n of batch) {
                    if (!seen.has(n.id)) {
                        out.set(n.id, { ...n, primacy: { label: "unknown", method: "llm", rationale: "missing from batch response" } });
                        errors.push(recoveredError("primacy-judge", `node ${n.id} missing from LLM batch`));
                    }
                }
            } catch (e) {
                for (const n of batch) out.set(n.id, { ...n, primacy: { label: "unknown", method: "llm", rationale: "batch failed" } });
                errors.push(recoveredError("primacy-judge", e instanceof Error ? e.message : String(e)));
                emit({ agent: "primacy-judge", phase: "recovery", summary: `batch ${i / BATCH + 1} failed → unknown` });
            }
        }

        const nodes = graph.nodes.map((n) => out.get(n.id) ?? n);
        const originCandidates = selectOrigins({ ...graph, nodes });
        emit({ agent: "primacy-judge", phase: "handoff", summary: `origins: ${originCandidates.join(", ")}`, data: { originCandidates } });
        emit({ agent: "primacy-judge", phase: "done", summary: `labeled ${nodes.length} nodes` });
        return { nodes, originCandidates, errors };
    };
}

export const judgePrimacy: JudgePrimacy = makeJudgePrimacy(callStructured);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/primacy/__tests__/judge-primacy.test.ts`
Expected: PASS (4 tests). Then Biome.

- [ ] **Step 6: Commit**

```bash
git add src/core/agents/primacy
git commit -m "feat(agents): PrimacyJudge port (heuristics + batched LLM + origins)"
```

---

### Task 7: Drift text fetch

**Files:**
- Create: `src/core/agents/drift/fetch-text.ts`
- Test: `src/core/agents/drift/__tests__/fetch-text.test.ts`

**Interfaces:**
- Consumes: `uploadPdf` (Task 2), `CitationNode`, `Part`.
- Produces: `resolveOriginContent(node: CitationNode, upload?: UploadFn): Promise<{ part: Part; basis: "fulltext" } | { text: string; basis: "abstract" } | null>` where `UploadFn = typeof uploadPdf`. `null` means no full text and no abstract — caller skips.

- [ ] **Step 1: Write the failing test**

`src/core/agents/drift/__tests__/fetch-text.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { CitationNode } from "@/core/run/domain";
import { resolveOriginContent } from "../fetch-text";

const node = (over: Partial<CitationNode> = {}): CitationNode => ({
    id: "W1", title: "t", year: 2020, doi: null, type: "article", venue: null, authors: [],
    abstract: "an abstract", citedByCount: 0, isRetracted: false, oaUrl: "http://x/y.pdf",
    depth: 1, source: "openalex", fetchStatus: "resolved", ...over,
});

describe("resolveOriginContent", () => {
    it("returns a fulltext part when the PDF uploads", async () => {
        const upload = vi.fn(async () => ({ fileData: { fileUri: "files/x" } }));
        const r = await resolveOriginContent(node(), upload as never);
        expect(r).toEqual({ part: { fileData: { fileUri: "files/x" } }, basis: "fulltext" });
    });

    it("falls back to abstract when the PDF is unavailable", async () => {
        const upload = vi.fn(async () => null);
        const r = await resolveOriginContent(node(), upload as never);
        expect(r).toEqual({ text: "an abstract", basis: "abstract" });
    });

    it("returns null when neither PDF nor abstract exists", async () => {
        const upload = vi.fn(async () => null);
        const r = await resolveOriginContent(node({ oaUrl: null, abstract: null }), upload as never);
        expect(r).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/drift/__tests__/fetch-text.test.ts`
Expected: FAIL — `resolveOriginContent` not exported.

- [ ] **Step 3: Implement `fetch-text.ts`**

```ts
import type { Part } from "@google/genai";
import type { CitationNode } from "@/core/run/domain";
import { uploadPdf } from "@/core/agents/gemini/upload-pdf";

export type UploadFn = typeof uploadPdf;
export type OriginContent =
    | { part: Part; basis: "fulltext" }
    | { text: string; basis: "abstract" }
    | null;

/** Prefer OA full text (PDF → Gemini File API); fall back to the abstract;
 * null when neither is available (caller skips this origin). */
export async function resolveOriginContent(node: CitationNode, upload: UploadFn = uploadPdf): Promise<OriginContent> {
    if (node.oaUrl) {
        const part = await upload(node.oaUrl);
        if (part) return { part, basis: "fulltext" };
    }
    if (node.abstract) return { text: node.abstract, basis: "abstract" };
    return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/drift/__tests__/fetch-text.test.ts`
Expected: PASS (3 tests). Then Biome.

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/drift/fetch-text.ts src/core/agents/drift/__tests__/fetch-text.test.ts
git commit -m "feat(agents): drift origin content resolution (fulltext/abstract)"
```

---

### Task 8: DriftAuditor port

**Files:**
- Create: `src/core/agents/drift/prompt.ts`
- Create: `src/core/agents/drift/audit-drift.ts`
- Test: `src/core/agents/drift/__tests__/audit-drift.test.ts`

**Interfaces:**
- Consumes: `resolveOriginContent` (Task 7), `callStructured` (Task 1), `MODELS`, `recoveredError`; contract `AuditDrift`, `DriftFinding`, `CitationNode`.
- Produces: `auditDrift: AuditDrift` and `makeAuditDrift(call, resolve): AuditDrift` (injection seam).
- LLM output schema: `driftAnswerSchema = z.object({ label: driftLabelSchema, evidenceQuote: z.string().nullable(), explanation: z.string() })` (per origin; `workId` + `basis` are added in code).

- [ ] **Step 1: Write the prompt module**

`src/core/agents/drift/prompt.ts`:
```ts
import { z } from "zod";
import { driftLabelSchema } from "@/core/run/domain";
import type { CitationNode } from "@/core/run/domain";

export const DRIFT_SYSTEM =
    "You audit citation drift. Given a CLAIM and the ORIGIN work it ultimately rests on, decide how well the origin supports the claim AS STATED:\n" +
    "- supported: the origin's finding matches the claim.\n" +
    "- partially-supported: origin supports it but the claim drops caveats/conditions.\n" +
    "- drifted: the claim inflates scope or strength beyond what the origin shows.\n" +
    "- contradicted: the origin shows the opposite or does not support it.\n" +
    "For any label other than a clean 'supported', quote a VERBATIM span from the origin as evidenceQuote (null if none found).";

export const driftAnswerSchema = z.object({
    label: driftLabelSchema,
    evidenceQuote: z.string().nullable(),
    explanation: z.string(),
});

export function buildDriftPrompt(claim: string, origin: CitationNode): string {
    return `CLAIM: ${claim}\n\nORIGIN: "${origin.title}" (${origin.venue ?? "unknown venue"}, ${origin.year ?? "n.d."}).\nThe origin work is provided as an attachment or below. Return {"label","evidenceQuote","explanation"}.`;
}
```

- [ ] **Step 2: Write the failing test**

`src/core/agents/drift/__tests__/audit-drift.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { CitationNode } from "@/core/run/domain";
import { makeAuditDrift } from "../audit-drift";

const node = (id: string, over: Partial<CitationNode> = {}): CitationNode => ({
    id, title: id, year: 2020, doi: null, type: "article", venue: null, authors: [],
    abstract: "abs", citedByCount: 0, isRetracted: false, oaUrl: "http://x/y.pdf",
    depth: 2, source: "openalex", fetchStatus: "resolved", ...over,
});
const emit = vi.fn();
const answer = (label: string) => ({ data: { label, evidenceQuote: "q", explanation: "e" }, usage: { prompt: 0, output: 0, total: 0 }, latencyMs: 1 });

describe("auditDrift", () => {
    it("produces one finding per origin with basis stamped", async () => {
        const call = vi.fn(async () => answer("drifted"));
        const resolve = vi.fn(async () => ({ part: { text: "x" }, basis: "fulltext" as const }));
        const audit = makeAuditDrift(call as never, resolve as never);
        const { findings } = await audit("claim", [node("W1"), node("W2")], emit);
        expect(findings).toHaveLength(2);
        expect(findings[0]).toMatchObject({ workId: "W1", label: "drifted", basis: "fulltext" });
    });

    it("uses abstract basis when full text is unavailable", async () => {
        const call = vi.fn(async () => answer("supported"));
        const resolve = vi.fn(async () => ({ text: "abs", basis: "abstract" as const }));
        const audit = makeAuditDrift(call as never, resolve as never);
        const { findings } = await audit("claim", [node("W1")], emit);
        expect(findings[0].basis).toBe("abstract");
    });

    it("skips an origin with no content and records a recovered error", async () => {
        const call = vi.fn(async () => answer("supported"));
        const resolve = vi.fn(async () => null);
        const audit = makeAuditDrift(call as never, resolve as never);
        const { findings, errors } = await audit("claim", [node("W1", { oaUrl: null, abstract: null })], emit);
        expect(findings).toHaveLength(0);
        expect(errors.some((e) => e.recovered)).toBe(true);
    });

    it("isolates a failing origin: others still produce findings", async () => {
        const call = vi.fn()
            .mockImplementationOnce(async () => { throw new Error("boom"); })
            .mockImplementationOnce(async () => answer("supported"));
        const resolve = vi.fn(async () => ({ text: "abs", basis: "abstract" as const }));
        const audit = makeAuditDrift(call as never, resolve as never);
        const { findings, errors } = await audit("claim", [node("W1"), node("W2")], emit);
        expect(findings).toHaveLength(1);
        expect(errors.length).toBe(1);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/drift/__tests__/audit-drift.test.ts`
Expected: FAIL — `makeAuditDrift` not exported.

- [ ] **Step 4: Implement `audit-drift.ts`**

```ts
import { createUserContent } from "@google/genai";
import type { CallResult } from "@/core/agents/gemini/call-structured";
import { callStructured } from "@/core/agents/gemini/call-structured";
import { MODELS } from "@/core/agents/gemini/client";
import { recoveredError } from "@/core/agents/gemini/errors";
import type { AuditDrift, DriftFinding, RunError } from "@/core/run/domain";
import { resolveOriginContent } from "./fetch-text";
import { buildDriftPrompt, driftAnswerSchema, DRIFT_SYSTEM } from "./prompt";

// biome-ignore lint/suspicious/noExplicitAny: injection seams for tests
type CallStructuredFn = (opts: any) => Promise<CallResult<any>>;
type ResolveFn = typeof resolveOriginContent;

export function makeAuditDrift(call: CallStructuredFn, resolve: ResolveFn): AuditDrift {
    return async (claim, origins, emit) => {
        emit({ agent: "drift-auditor", phase: "start", summary: `auditing ${origins.length} origins` });
        const findings: DriftFinding[] = [];
        const errors: RunError[] = [];

        for (const origin of origins) {
            const content = await resolve(origin);
            if (!content) {
                errors.push(recoveredError("drift-auditor", `no full text or abstract for ${origin.id}`));
                emit({ agent: "drift-auditor", phase: "recovery", summary: `${origin.id}: no content, skipped` });
                continue;
            }
            const promptText = buildDriftPrompt(claim, origin);
            const contents = "part" in content
                ? createUserContent([promptText, content.part])
                : createUserContent([`${promptText}\n\nORIGIN ABSTRACT:\n${content.text}`]);
            try {
                const { data } = await call({
                    model: MODELS.drift, system: DRIFT_SYSTEM, contents,
                    schema: driftAnswerSchema, agent: "drift-auditor", emit,
                    label: `drift ${origin.id}`,
                });
                findings.push({ workId: origin.id, label: data.label, evidenceQuote: data.evidenceQuote, explanation: data.explanation, basis: content.basis });
                emit({ agent: "drift-auditor", phase: "progress", summary: `${origin.id}: ${data.label} (${content.basis})` });
            } catch (e) {
                errors.push(recoveredError("drift-auditor", e instanceof Error ? e.message : String(e)));
                emit({ agent: "drift-auditor", phase: "recovery", summary: `${origin.id}: audit failed, skipped` });
            }
        }
        emit({ agent: "drift-auditor", phase: "done", summary: `${findings.length} findings` });
        return { findings, errors };
    };
}

export const auditDrift: AuditDrift = makeAuditDrift(callStructured, resolveOriginContent);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/drift/__tests__/audit-drift.test.ts`
Expected: PASS (4 tests). Then Biome.

- [ ] **Step 6: Commit**

```bash
git add src/core/agents/drift/prompt.ts src/core/agents/drift/audit-drift.ts src/core/agents/drift/__tests__/audit-drift.test.ts
git commit -m "feat(agents): DriftAuditor port (per-origin, isolated failures)"
```

---

### Task 9: WriteVerdict port (score + prose)

**Files:**
- Create: `src/core/agents/verdict/prompt.ts`
- Create: `src/core/agents/verdict/write-verdict.ts`
- Test: `src/core/agents/verdict/__tests__/write-verdict.test.ts`

**Interfaces:**
- Consumes: `scoreVerdict` (Task 4), `callStructured` (Task 1), `MODELS`; contract `WriteVerdict`, `Verdict`.
- Produces: `writeVerdict: WriteVerdict` and `makeWriteVerdict(call): WriteVerdict`.
- Prose output schema: `proseSchema = z.object({ prose: z.string() })`.

- [ ] **Step 1: Write the prompt module**

`src/core/agents/verdict/prompt.ts`:
```ts
import { z } from "zod";
import type { DriftFinding } from "@/core/run/domain";
import type { ScoreResult } from "./score";

export const VERDICT_SYSTEM =
    "You write a short, factual justification for a citation-provenance verdict. " +
    "The numeric score, confidence, and pathogens are FIXED (computed elsewhere) — never dispute or recompute them. " +
    "Explain WHY in <=120 words, referencing the pathogens and drift evidence. No preamble.";

export const proseSchema = z.object({ prose: z.string() });

export function buildVerdictPrompt(claim: string, score: ScoreResult, drift: DriftFinding[]): string {
    return `CLAIM: ${claim}\n\nFIXED RESULT: ${JSON.stringify({
        confidence: score.confidence, score: score.score, pathogens: score.pathogens,
        primaryRatio: Number(score.primaryRatio.toFixed(2)), coverage: score.coverage,
    })}\n\nDRIFT EVIDENCE: ${JSON.stringify(drift.map((d) => ({ label: d.label, quote: d.evidenceQuote })))}\n\nWrite {"prose"}.`;
}

/** Deterministic fallback used when the prose LLM call fails. */
export function templateProse(score: ScoreResult): string {
    const p = score.pathogens.length ? `Pathogens: ${score.pathogens.join(", ")}.` : "No pathogens detected.";
    return `Confidence ${score.confidence} (score ${score.score}/100). ${p} Primary-source ratio ${Math.round(score.primaryRatio * 100)}%, coverage ${score.coverage.resolved}/${score.coverage.total} nodes resolved.`;
}
```

- [ ] **Step 2: Write the failing test**

`src/core/agents/verdict/__tests__/write-verdict.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import type { CitationGraph, CitationNode } from "@/core/run/domain";
import { makeWriteVerdict } from "../write-verdict";

const node = (id: string, over: Partial<CitationNode> = {}): CitationNode => ({
    id, title: id, year: 2020, doi: null, type: "article", venue: null, authors: [],
    abstract: null, citedByCount: 0, isRetracted: false, oaUrl: null, depth: 1,
    source: "openalex", fetchStatus: "resolved", primacy: { label: "primary", method: "heuristic" }, ...over,
});
const graph: CitationGraph = { nodes: [node("W1"), node("W2")], edges: [], truncated: false };
const emit = vi.fn();

describe("writeVerdict", () => {
    it("returns a full Verdict with LLM prose and code-computed numbers", async () => {
        const call = vi.fn(async () => ({ data: { prose: "Solid primary support." }, usage: { prompt: 0, output: 0, total: 0 }, latencyMs: 1 }));
        const write = makeWriteVerdict(call as never);
        const v = await write({ claim: "c", graph, cycles: [], driftFindings: [], errors: [] }, emit);
        expect(v.confidence).toBe("HIGH");
        expect(v.prose).toBe("Solid primary support.");
        expect(v.score).toBeGreaterThanOrEqual(70);
    });

    it("falls back to templated prose when the LLM call fails", async () => {
        const call = vi.fn(async () => { throw new Error("boom"); });
        const write = makeWriteVerdict(call as never);
        const v = await write({ claim: "c", graph, cycles: [], driftFindings: [], errors: [] }, emit);
        expect(v.prose).toContain("Confidence HIGH");
        expect(v.confidence).toBe("HIGH");
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/verdict/__tests__/write-verdict.test.ts`
Expected: FAIL — `makeWriteVerdict` not exported.

- [ ] **Step 4: Implement `write-verdict.ts`**

```ts
import type { CallResult } from "@/core/agents/gemini/call-structured";
import { callStructured } from "@/core/agents/gemini/call-structured";
import { MODELS } from "@/core/agents/gemini/client";
import type { Verdict, WriteVerdict } from "@/core/run/domain";
import { scoreVerdict } from "./score";
import { buildVerdictPrompt, proseSchema, templateProse, VERDICT_SYSTEM } from "./prompt";

// biome-ignore lint/suspicious/noExplicitAny: injection seam for tests
type CallStructuredFn = (opts: any) => Promise<CallResult<any>>;

export function makeWriteVerdict(call: CallStructuredFn): WriteVerdict {
    return async ({ claim, graph, cycles, driftFindings }, emit) => {
        emit({ agent: "verdict", phase: "start", summary: "scoring verdict" });
        const score = scoreVerdict({ graph, cycles, driftFindings });
        emit({ agent: "verdict", phase: "progress", summary: `${score.confidence} (${score.score}) ${score.pathogens.join(",") || "no pathogens"}` });

        let prose: string;
        try {
            const { data } = await call({
                model: MODELS.verdict, system: VERDICT_SYSTEM,
                contents: buildVerdictPrompt(claim, score, driftFindings),
                schema: proseSchema, agent: "verdict", emit, label: "verdict prose",
            });
            prose = data.prose;
        } catch {
            prose = templateProse(score);
            emit({ agent: "verdict", phase: "recovery", summary: "prose LLM failed → template" });
        }

        const verdict: Verdict = { ...score, prose };
        emit({ agent: "verdict", phase: "done", summary: `verdict: ${verdict.confidence}` });
        return verdict;
    };
}

export const writeVerdict: WriteVerdict = makeWriteVerdict(callStructured);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agents/verdict/__tests__/write-verdict.test.ts`
Expected: PASS (2 tests). Then Biome.

- [ ] **Step 6: Commit**

```bash
git add src/core/agents/verdict/prompt.ts src/core/agents/verdict/write-verdict.ts src/core/agents/verdict/__tests__/write-verdict.test.ts
git commit -m "feat(agents): WriteVerdict port (deterministic score + LLM prose)"
```

---

### Task 10: Barrel export + port-conformance typecheck

**Files:**
- Create: `src/core/agents/index.ts`
- Test: `src/core/agents/__tests__/ports.test.ts`

**Interfaces:**
- Produces: `export { judgePrimacy, auditDrift, writeVerdict }` — the exact symbols the orchestrator imports into `src/core/run/server/graph.ts`.

- [ ] **Step 1: Write the failing test**

`src/core/agents/__tests__/ports.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { AuditDrift, JudgePrimacy, WriteVerdict } from "@/core/run/domain";
import { auditDrift, judgePrimacy, writeVerdict } from "../index";

describe("agents barrel", () => {
    it("exports the three port implementations", () => {
        // Type-level conformance: assignment fails to compile if the signature drifts.
        const a: JudgePrimacy = judgePrimacy;
        const b: AuditDrift = auditDrift;
        const c: WriteVerdict = writeVerdict;
        expect([a, b, c].every((f) => typeof f === "function")).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/agents/__tests__/ports.test.ts`
Expected: FAIL — `../index` has no such exports.

- [ ] **Step 3: Implement `index.ts`**

```ts
export { judgePrimacy } from "./primacy/judge-primacy";
export { auditDrift } from "./drift/audit-drift";
export { writeVerdict } from "./verdict/write-verdict";
```

- [ ] **Step 4: Run test + full typecheck + suite**

Run: `pnpm vitest run src/core/agents/__tests__/ports.test.ts && pnpm typecheck && pnpm vitest run src/core/agents`
Expected: PASS; `tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/index.ts src/core/agents/__tests__/ports.test.ts
git commit -m "feat(agents): barrel export of the three ports"
```

---

### Task 11: Drift benchmark harness (manual, not TDD)

**Files:**
- Create: `src/core/agents/drift/benchmark/bench.ts`
- Create: `src/core/agents/drift/benchmark/fixtures/claims.ts`
- Test: `src/core/agents/drift/benchmark/__tests__/bench.smoke.test.ts`

**Interfaces:**
- Consumes: `resolveOriginContent`, `callStructured`, `buildDriftPrompt`, `driftAnswerSchema`, `DRIFT_SYSTEM`.
- Produces: `runBenchmark(models?: string[]): Promise<BenchRow[]>` where `BenchRow = { model: string; claim: string; label: string; basis: string; latencyMs: number; totalTokens: number }`, and a CLI entry that prints a table. **Live Gemini calls — run manually, never in CI.**

- [ ] **Step 1: Write the fixtures**

`src/core/agents/drift/benchmark/fixtures/claims.ts` — 3 real OA-backed cases (fill `oaUrl` with a known OA PDF; abstract as fallback):
```ts
import type { CitationNode } from "@/core/run/domain";

export interface BenchCase { claim: string; origin: CitationNode; }

const origin = (over: Partial<CitationNode>): CitationNode => ({
    id: "W0", title: "", year: 2020, doi: null, type: "article", venue: null, authors: [],
    abstract: null, citedByCount: 0, isRetracted: false, oaUrl: null, depth: 2,
    source: "openalex", fetchStatus: "resolved", ...over,
});

// NOTE: pick 3 claims whose origins are OA and whose drift verdict you can judge by hand.
export const BENCH_CASES: BenchCase[] = [
    { claim: "Fill in claim 1 (a known over-generalization).", origin: origin({ id: "W2001", title: "Origin 1", oaUrl: "https://arxiv.org/pdf/XXXX.pdf" }) },
    { claim: "Fill in claim 2 (faithful citation).", origin: origin({ id: "W2002", title: "Origin 2", oaUrl: "https://arxiv.org/pdf/YYYY.pdf" }) },
    { claim: "Fill in claim 3 (caveat dropped).", origin: origin({ id: "W2003", title: "Origin 3", oaUrl: "https://arxiv.org/pdf/ZZZZ.pdf" }) },
];
```

- [ ] **Step 2: Write the benchmark runner**

`src/core/agents/drift/benchmark/bench.ts`:
```ts
import { createUserContent } from "@google/genai";
import { callStructured } from "@/core/agents/gemini/call-structured";
import { resolveOriginContent } from "@/core/agents/drift/fetch-text";
import { buildDriftPrompt, driftAnswerSchema, DRIFT_SYSTEM } from "@/core/agents/drift/prompt";
import { BENCH_CASES } from "./fixtures/claims";

export interface BenchRow { model: string; claim: string; label: string; basis: string; latencyMs: number; totalTokens: number; }
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.1-pro"];
const noEmit = () => {};

export async function runBenchmark(models: string[] = DEFAULT_MODELS): Promise<BenchRow[]> {
    const rows: BenchRow[] = [];
    for (const model of models) {
        for (const { claim, origin } of BENCH_CASES) {
            const content = await resolveOriginContent(origin);
            if (!content) { rows.push({ model, claim, label: "NO_CONTENT", basis: "none", latencyMs: 0, totalTokens: 0 }); continue; }
            const contents = "part" in content
                ? createUserContent([buildDriftPrompt(claim, origin), content.part])
                : createUserContent([`${buildDriftPrompt(claim, origin)}\n\n${content.text}`]);
            const { data, usage, latencyMs } = await callStructured({ model, system: DRIFT_SYSTEM, contents, schema: driftAnswerSchema, agent: "drift-auditor", emit: noEmit, label: `bench ${model}` });
            rows.push({ model, claim: claim.slice(0, 40), label: data.label, basis: content.basis, latencyMs, totalTokens: usage.total });
        }
    }
    return rows;
}

// Manual entry: `pnpm tsx --env-file=.env src/core/agents/drift/benchmark/bench.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
    runBenchmark().then((rows) => { console.table(rows); }).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 3: Write a smoke test (structure only, no live calls)**

`src/core/agents/drift/benchmark/__tests__/bench.smoke.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BENCH_CASES } from "../fixtures/claims";

describe("benchmark fixtures", () => {
    it("defines exactly 3 cases, each with a claim and an origin", () => {
        expect(BENCH_CASES).toHaveLength(3);
        for (const c of BENCH_CASES) {
            expect(c.claim.length).toBeGreaterThan(0);
            expect(c.origin.id).toMatch(/^W\d+$/);
        }
    });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `pnpm vitest run src/core/agents/drift/benchmark/__tests__/bench.smoke.test.ts`
Expected: PASS. (Do NOT run `bench.ts` in CI — it calls Gemini.)

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/drift/benchmark
git commit -m "feat(agents): drift benchmark harness (manual, 3 claims x N models)"
```

---

## Final: full suite + PR

- [ ] Run the whole Part 2 suite + typecheck + lint:
  `pnpm vitest run src/core/agents && pnpm typecheck && pnpm biome check src/core/agents`
- [ ] Push the branch and open a PR to `main`:
  `git push -u origin feat/llm-agents` then `gh pr create --base main --title "feat: LLM agents (Part 2)" --body "..."`.
- [ ] Notify the orchestrator session (they merge + swap the stubs in `graph.ts`). Do not merge `main` yourself.
- [ ] After DriftAuditor lands, fill the 3 real benchmark cases and run `bench.ts` manually; record the model decision in the spec.

## Self-Review notes (author)

- **Spec coverage:** wrapper (T1–2), primacy heuristics+LLM+origins (T3,5,6), drift fetch+audit (T7,8), verdict score+prose (T4,9), benchmark (T11), barrel (T10), tests (each task), coordination items (spec §8, no code). All spec sections mapped.
- **Type consistency:** `callStructured` result `{data,usage:{prompt,output,total},latencyMs}` used identically in T6/T8/T9/T11. `Primacy{label,method,rationale}`, `DriftFinding{workId,label,evidenceQuote,explanation,basis}`, `Verdict{confidence,score,pathogens,primaryRatio,coverage,prose}` match the contracts verbatim. `selectOrigins` shared by T6 and T4.
- **Placeholders:** only the 3 benchmark claims are intentionally author-filled (real OA papers, chosen during demo prep per spec §6); flagged explicitly in T11, not a logic gap.
