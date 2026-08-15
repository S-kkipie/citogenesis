# Citogenesis

**Trace every claim to its root. Catch the ones with no root.**

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

## Stack (proposed)

- Python. Orchestration: **LangGraph** (a graph engine for a graph problem) or CrewAI.
- Cheap LLM (DeepSeek / Llama) for node labeling; stronger model reserved for DriftAuditor.
- Frontend: interactive graph (react-flow / vis-network).

## Status

🌱 Brainstormed & scoped. Feasibility (APIs) confirmed. Not yet built.
See [CLAUDE.md](./CLAUDE.md) for the full working brief.
