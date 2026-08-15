# Citogenesis — Parallel Work Plan (3 peers + orchestrator)

**Date:** 2026-08-15
**Orchestrator:** main session (this doc's author). Owns scaffold, shared
contracts, integration, and ALL merges to `main`.
**Peers:** 3 Claude sessions, each owns one workstream below. Each peer
brainstorms its part WITH the user first (superpowers:brainstorming), writes its
own spec to `docs/superpowers/specs/`, then implements.

**Parent spec:** [2026-08-15-stack-architecture-design.md](../specs/2026-08-15-stack-architecture-design.md)
— stack is LOCKED (Next 16 starter, LangGraph.js, Gemini, OpenAlex, react-flow,
Vercel). Peers design *inside* their part, not the stack.

## Ground rules (all peers)

1. **Branch per workstream**, cut from `main` after the scaffold lands:
   - Part 1 → `feat/tracer`
   - Part 2 → `feat/llm-agents`
   - Part 3 → `feat/frontend`
2. **Work in a git worktree**, never in the orchestrator's checkout:
   `git worktree add ../citogenesis-<part> feat/<part>` from
   `~/work/AI-DO/citogenesis` (or clone fresh).
3. **File ownership is disjoint** (see per-part lists). Never edit another
   part's files or the shared contracts. Contract change needed → message the
   orchestrator session, don't edit.
4. **Merge protocol:** push branch → open PR to `main` → notify orchestrator.
   Orchestrator reviews, resolves conflicts, merges. Nobody else pushes `main`.
5. Specs can be written/committed on your feat branch immediately (specs don't
   conflict — distinct filenames).

## Shared contracts (orchestrator-owned, land on `main` first)

Located in `src/core/run/domain/` once scaffold lands:

- `state.ts` — LangGraph run state: claim, anchor, graph (nodes/edges), labels,
  drift findings, verdict. Zod schemas + inferred types.
- `trace.ts` — run-trace event schema (timestamp, agent, phase, input/output
  summary). The auditable-result artifact.
- `graph.ts` — CitationNode / CitationEdge types (OpenAlex id, metadata, OA
  location, primacy label, pathogen flags).
- `api.ts` — route shapes: `POST /api/v1/runs` (SSE stream), `GET /api/v1/runs/:id`.

Until these land, peers work on brainstorm + spec only. Orchestrator announces
when `main` has scaffold + contracts.

## Part 1 — ChainTracer + data clients + input adapters (NO LLM)

**Scope:** everything between user input and a labeled-ready citation graph.
- OpenAlex client: batch fetch (`/works?filter=openalex:W1|W2`, 100/call,
  `mailto=` polite pool), retry/backoff.
- Semantic Scholar client: per-node fallback (~1 RPS budget).
- BFS backwards via `referenced_works`: depth ≤ 3, ≤ 25 refs expanded/node,
  ≤ 200 nodes total. Cycle detection during traversal (pathogen #1).
- Input adapters: (A) loose claim → OpenAlex search → anchor; (B) arXiv id/DOI →
  work; (C) Wikipedia URL → scrape `[n]` refs → anchor set.
- Fixtures: recorded OpenAlex JSON for offline deterministic tests.

**Owns:** `src/core/citations/**`
**Open for its brainstorm:** anchor-selection heuristics for door A, Wikipedia
scrape approach, ref-expansion prioritization (which 25), unresolved-node
reporting shape.

## Part 2 — LLM agents: PrimacyJudge, DriftAuditor, Verdict

**Scope:** everything that calls Gemini.
- Gemini client wrapper: structured output, schema validation, 1 retry with
  error feedback, then mark-and-continue.
- PrimacyJudge: OpenAlex `type` heuristics first (review/editorial/letter →
  secondary); LLM (`gemini-3.5-flash-lite`) only for ambiguous, batched ≈50
  nodes/prompt on title+abstract+venue+type.
- DriftAuditor (`gemini-3.6-flash`): origin candidates only (≤3 roots), fetch
  OA full text (arXiv/PMC), 4-level rubric: supported / partially-supported /
  drifted / contradicted + quoted evidence span. Abstract-level fallback when
  no full text, with lowered confidence flag.
- Verdict: deterministic score in code (pathogen flags + primary ratio + drift
  → LOW/MEDIUM/HIGH), LLM prose justification.
- Drift benchmark: 3 real claims × {flash-lite, 3.6-flash, 3.1-pro}.

**Owns:** `src/core/agents/**`
**Open for its brainstorm:** primacy prompt design, ambiguity threshold,
full-text extraction (PDF→text), drift prompt + evidence-span format, exact
scoring weights.

## Part 3 — Frontend

**Scope:** everything the judges see.
- react-flow citation graph: nodes colored by primacy/pathogen, edges by
  support path, cycle highlight.
- Verdict card: confidence + pathogen + coverage + evidence quotes.
- Run progress UI over SSE: live per-agent phases (the collaboration story,
  visible).
- Input form: 3 doors (claim / arXiv-DOI / Wikipedia URL).
- Run permalink page reading stored trace (`GET /runs/:id`).

**Owns:** `src/app/**` (except `api/`), `src/core/run/client/**`
**Open for its brainstorm:** layout, graph visual language, how to render the
trace as an "audit log" panel, demo-recording friendliness.

## Orchestrator (this session)

- Scaffold: import hackaton-starter, strip Better Auth, Drizzle `runs` table.
- Shared contracts above.
- LangGraph.js graph wiring with stub agent nodes + Elysia `/runs` SSE route —
  the skeleton every part plugs into.
- Integration, conflict resolution, merges to `main`, deploy to Vercel.

## Sequencing

```
now        peers: brainstorm w/ user → part specs (parallel, no code deps)
           orchestrator: scaffold + contracts → push main
then       peers: cut feat branches → implement against contracts (parallel)
finally    PRs → orchestrator merges → integration pass → deploy
```
