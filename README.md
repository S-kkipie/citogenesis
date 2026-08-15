# Citogenesis

**Trace every claim to its root. Catch the ones with no root.**

**🔴 Live demo: https://citogenesis.vercel.app/audit**

A multi-agent AI system that audits the **citation provenance** of a scientific
claim — following the trail of references backwards until it either hits real
primary evidence or exposes a citation that only *looks* true because sources
cite each other. Named after [xkcd #978 "Citogenesis"](https://xkcd.com/978/).

Built for the **Research Agents Hack (IIT Madras)** — Track: *Citation Verification*.

---

## The problem

A claim can propagate through hundreds of papers and still have **zero primary
evidence** behind it. Four failure modes ("citation pathogens"):

1. **Circular support** — A cites B, B cites C, C cites A. Nobody holds the data.
2. **No primary source** — the chain of 50 citations dead-ends at a review,
   editorial, blog, or news article — never an original measurement.
3. **Single point of failure** — 200 papers all trace to *one* original study
   that was retracted, tiny (n=12), or an un-reviewed preprint.
4. **Claim drift** — the origin says "X in mice, with caveats"; downstream cites
   it as "X in humans, proven." The support deforms as it travels.

LLM-written papers are making all four worse and more common.

## What Citogenesis does

Give it a claim (three ways in), it returns a **trust verdict + citation graph +
auditable trace**:

- "This claim appears in 40 papers. All trace back to ONE 2019 preprint, n=8,
  never replicated. Confidence: **low**. Pathogen: single-point-of-failure."

### Three input doors → one core

```
A) A loose claim          ─┐
B) A paper (PDF / arXiv id) ┼─► InputAdapter ─► (claim, anchor citation) ─► CORE
C) A Wikipedia statement   ─┘
```

- **A** loose claim → OpenAlex search finds who asserts it → anchor citation.
- **B** paper/arXiv → parse its `referenced_works` directly.
- **C** Wikipedia → scrape the `[n]` references (the literal xkcd case).

80% of the code is the shared core; the adapters are thin.

## Architecture (multi-agent)

| Agent | Job |
|---|---|
| **ChainTracer** | BFS backwards through `referenced_works`, builds the citation graph |
| **PrimacyJudge** | Label each node: primary (original data) vs secondary (review/opinion) |
| **DriftAuditor** | Read the origin's OA full-text vs the claim — did the support deform? |
| **Verdict / Writer** | Confidence score + pathogen detected + auditable report |

Real collaboration, not a prompt chain: Tracer hands the graph to Primacy →
Primacy labels → Drift reads full-text → Verdict synthesizes. Every hop is
logged to an inspectable run-trace JSON.

## Data sources (all confirmed free)

- **[OpenAlex](https://openalex.org)** — citation graph. `referenced_works`
  (outgoing), `cited_by_api_url` (incoming), OA flags. No key, 100k calls/day.
- **[Semantic Scholar Graph API](https://api.semanticscholar.org)** —
  references/citations + abstracts. Free, 1 RPS.
- **Full text** for claim-drift: OpenAlex OA locations → arXiv / PMC PDFs.

## Judging fit (Research Agents Hack rubric)

- Research utility 30% — catches fabricated/hollow citations, a real & growing pain.
- Agent collaboration 25% — distinct roles, explicit handoffs, error recovery.
- Working demo 20% — interactive citation graph over a real claim.
- Cost efficiency 15% — graph work is cheap API; LLM only on Primacy/Drift.
- Originality 10% — nobody else audits *citation provenance* adversarially.

## Stack

- **TypeScript end-to-end.** Next.js (App Router) + Elysia (typed API, SSE).
- **Orchestration: LangGraph** — a graph engine for a graph problem. Each
  agent is a node; every trace event and graph delta streams live over SSE
  via LangGraph's custom stream mode while the pipeline runs.
- **LLMs (Gemini):** `gemini-3.5-flash-lite` labels nodes (PrimacyJudge),
  `gemini-3.6-flash` reads full-text for drift + writes the verdict prose,
  `gemini-3.1-pro` as drift fallback. The verdict *score* is computed
  deterministically in code — words from the model, numbers from code.
- **Frontend:** Sigma (WebGL) citation graph that grows in real time +
  an orchestration rail showing the agents working and handing off live.
- **Postgres (drizzle)** persists every run: shareable permalinks, full
  audit trace, and input-dedupe (identical inputs reuse the finished run
  at zero cost).

## Setup

```bash
pnpm install
cp .env.example .env          # fill: DATABASE_URL, GEMINI_API_KEY, OPENALEX_MAILTO
docker compose up -d          # local Postgres (or point DATABASE_URL anywhere)
pnpm db:migrate
pnpm dev                      # http://localhost:3000/audit
```

`pnpm test` runs the suite (~165 tests, no network needed).

## Reproducibility

- **Models:** Gemini `3.5-flash-lite` (primacy labeling, batched 50/call),
  `3.6-flash` (drift audit + verdict prose), `3.1-pro` (drift fallback).
- **APIs:** OpenAlex (free, no key, polite-pool via `mailto`) for the
  citation graph + metadata; arXiv/PMC PDFs via OpenAlex OA locations for
  full text. Semantic Scholar client included as backup source.
- **Datasets:** none — every run pulls live data from OpenAlex.
- **Estimated run cost:** one audit ≈ 10–25 OpenAlex requests + 5–10 Gemini
  calls (mostly flash-lite) → **well under $0.01/run**; typical wall time
  60–90 s. Repeated inputs are deduped and cost zero.
- **Budgets/limits:** BFS capped at depth 3, 25 refs/node, 200 nodes.
  Claim-drift needs an open-access origin (falls back to abstract, flagged
  as lower confidence). English-centric. Runs cap at 300 s on the hosted
  demo.

## Status

✅ Built, tested, and deployed: https://citogenesis.vercel.app — run a
claim on `/audit`, watch the agents work live, browse past runs on `/runs`.
