# DoraHacks BUIDL submission — draft

Hackathon: Research Agents Hack: Build Multi-Agent AI Systems (IIT Madras)
Track: **Citation Verification**

## BUIDL fields

- **Name:** Citogenesis
- **Tagline:** Trace every claim to its root. Catch the ones with no root.
- **Live demo:** https://citogenesis.aido.lat/audit
- **Repo:** https://github.com/S-kkipie/citogenesis (public)
- **Sample result permalink:** https://citogenesis.aido.lat/runs/sample-run
- **Tech tags:** LangGraph (allowed platform tag), TypeScript, Next.js, Gemini, OpenAlex, Postgres
- **Team:** Adrian Issac (solo)
- **Demo video (3 min):** https://youtu.be/BAna-9GELyg
- **Submitted:** https://dorahacks.io/buidl/48008 (17 Aug 2026, before the
  11:59 PM IST deadline)

## Confirmed rules (read off the DoraHacks page, 15 Aug)

- **Submission deadline: 17 August 2026, 11:59 PM IST.** Judging 18–20 Aug,
  results 21 Aug. (Header shows a contradictory 8 Aug close — body timeline
  is authoritative per the page's own corrections note.)
- Submit requires DoraHacks login → "Submit BUIDL" on the hackathon page.
- Summary ≤200 words must cover: problem, agent architecture, evidence/data
  sources, expected impact (draft below covers all four).
- Judges may look for: architecture diagram, agent execution trace, evidence
  citations, cost table, failure-case demo — we have the trace (permalinks),
  cost table (README), and can show a failed run; the README's door diagram
  + agent table serve as architecture.

## Summary (≤200 words — currently ~175)

Citogenesis audits the citation provenance of a scientific claim. Give it a
claim, a paper DOI, or a Wikipedia article; four agents trace the references
backwards until they hit primary evidence — or expose a claim that only
looks true because sources cite each other.

ChainTracer BFSes OpenAlex's citation graph (depth 3, 200 nodes, pure API —
no LLM). PrimacyJudge labels every node primary vs secondary (heuristics
first, Gemini flash-lite for the ambiguous). DriftAuditor reads the origin
paper's open-access full text against the claim and measures how the support
deformed. Verdict computes a deterministic 0–100 score, names the pathogen —
circular support, no primary source, single point of failure, claim drift —
and writes the justification.

The collaboration is visible: every handoff, retry, and recovery streams
live over SSE into an orchestration view, and the citation graph grows in
real time as the tracer walks it. Every run persists with its full audit
trace at a shareable permalink; identical inputs reuse the finished run at
zero cost.

A typical audit costs under $0.01 and takes about 90 seconds — turning a
day of manual reference-chasing into a minute-long, auditable check for
reviewers, editors, and journalists. Live at citogenesis.aido.lat.

## Reproducibility (for the form, condensed)

Models: Gemini 3.5-flash-lite (primacy), 3.6-flash (drift + verdict prose),
3.1-pro (drift fallback); score computed in code, never by the LLM.
APIs: OpenAlex (free, keyless, polite pool); arXiv/PMC full text via OA
locations. Datasets: none — live data per run. Cost: ≈10–25 OpenAlex
requests + 5–10 Gemini calls per audit, <$0.01, 60–90 s; dedupe makes
repeats free. Limits: BFS depth 3 / 25 refs/node / 200 nodes; drift needs
an OA origin (abstract fallback flagged); English-centric; 300 s cap on the
hosted demo. Full setup in README (pnpm install → docker compose up →
pnpm db:migrate → pnpm dev).
