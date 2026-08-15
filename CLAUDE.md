# Citogenesis — working brief (for the next Claude session)

This file is the handoff context. It was written during a brainstorm session in
`~/work/AI-DO` before the project moved into its own repo. Read it fully before
acting.

## What this is

**Citogenesis**: a multi-agent AI system that audits the *citation provenance*
of a scientific claim. It traces references backwards until it hits real primary
evidence — or exposes a claim that only looks true because sources cite each
other. See [README.md](./README.md) for the pitch.

## Why it exists

Submission for the **Research Agents Hack: Build Multi-Agent AI Systems (IIT
Madras)** on DoraHacks. Track chosen: **Citation Verification**.

- Hackathon page: https://dorahacks.io/hackathon/iitm-research-agents/detail
- Fully online. Team size 1–4. Prize listed as US$100 (page has contradictions —
  verify before trusting; the win here is the build, not the cash).
- Rule that matters: **≥2 agents with distinct roles, real coordination,
  failure handling, auditable result.** NOT a disguised prompt chain.
- Deliverables: public repo + setup, 3-min demo video, ≤200-word summary,
  reproducibility section (models, APIs, datasets, est. run cost, limits).
- Judging: research utility 30% / agent collaboration 25% / working demo 20% /
  cost efficiency 15% / originality 10%.
- Allowed platform tech tags: CrewAI, LangGraph, AutoGen, Llama 4, DeepSeek V4.

## The core idea (locked)

Detect 4 "citation pathogens":
1. Circular support (A→B→C→A).
2. No primary source (chain dead-ends at review/opinion/news).
3. Single point of failure (many papers, one fragile origin — retracted / tiny n / preprint).
4. Claim drift (origin's caveated finding cited downstream as absolute/generalized). ← the gem; needs full-text comparison.

Three input doors converge to one core via thin adapters:
- A) loose claim → OpenAlex search → anchor citation
- B) paper / arXiv id → parse `referenced_works`
- C) Wikipedia statement → scrape `[n]` refs (literal xkcd case)

## Agents (draft — refine during design)

| Agent | Job |
|---|---|
| ChainTracer | BFS backwards via OpenAlex `referenced_works`; build citation graph |
| PrimacyJudge | Label each node primary (original data) vs secondary (review/opinion) |
| DriftAuditor | Read OA full-text of origin vs the claim; measure support deformation |
| Verdict/Writer | Confidence score + pathogen + auditable report |

Handoffs are the collaboration story: Tracer → Primacy → Drift → Verdict.
Log every hop to an inspectable run-trace JSON (this is the "auditable result").

## Feasibility — CONFIRMED (do not re-litigate)

- OpenAlex: free, no key, 100k/day. `GET /works/{id}` returns `referenced_works`
  (outgoing edges), `cited_by_api_url` (incoming), and OA/`best_oa_location`.
  Batch fetch: `/works?filter=openalex:W1|W2&per_page=100`. Add `mailto=` for polite pool.
- Semantic Scholar Graph API: free, ~1 RPS. `references`/`citations` with
  `.abstract`, `.year`, `.authors` subfields. Backup + TLDR.
- Full text for drift: follow OpenAlex OA location → arXiv / PMC PDF. Demo on
  OA papers so full text is guaranteed.
- The "hard" citation-graph part is literally an API field. No blockers.

## Proposed stack

- Python. Orchestration: LangGraph (graph engine for a graph problem) or CrewAI.
- Node labeling on a cheap model (DeepSeek / Llama); reserve a stronger model for DriftAuditor.
- Frontend: interactive citation graph (react-flow or vis-network).
- Keep LLM calls off the graph traversal (pure API) → cost stays low (15% criterion).

## Demo target (the "wow")

Interactive citation graph over a real claim + verdict card:
"cited in N papers → all trace to ONE preprint, n=8, never replicated →
confidence LOW → pathogen: single-point-of-failure." Objective, visual, hard to fake.

## Competition (as of brainstorm)

Only 4 BUIDLs submitted, most off-topic. Only real rival: **Reprograph**
(6 agents auditing paper *reproducibility* → 100-pt score). Different angle —
they audit reproducibility of a method; we audit provenance/validity of citations.
Field is nearly open.

## What's decided vs open

DECIDED: name (Citogenesis), track (Citation Verification), core 4 pathogens,
3 input doors, agent skeleton, data sources, feasibility.

OPEN (next design work): exact LangGraph vs CrewAI, graph depth/breadth limits
(BFS budget), how PrimacyJudge classifies source type, drift-scoring rubric,
frontend framework, which flagship claim to use for the demo, run-cost budget.

## Next steps

1. Pick orchestration framework, scaffold Python project.
2. Build ChainTracer against OpenAlex first (pure API, no LLM) — prove the graph.
3. Add PrimacyJudge, then DriftAuditor, then Verdict.
4. Wire the 3 input adapters (start with C/Wikipedia — easiest, best meme demo).
5. Frontend graph + verdict card.
6. Record 3-min demo, write 200-word summary + reproducibility section, submit BUIDL.

## Author

Adrian Issac (GitHub: S-kkipie). AI product builder.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
