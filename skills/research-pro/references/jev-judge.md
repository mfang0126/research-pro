# Jev pre-judgment layer (jev_plan / jev_rank)

> **Language:** English (default) · [中文](jev-judge.zh-CN.md)

Optional, fail-open layer that adds one fast TypeSafe **Jev** call before and
after a search. Jev is a decisions model (typed `noul` / `choice` answers),
not a text model: code proposes, Jev selects and scores.

Pattern adapted from [superagents-lab/jev-search](https://github.com/superagents-lab/jev-search)
(`src/lib/candidates.ts`, `src/lib/typesafe.ts`, `src/lib/pipeline.ts`;
MIT License, Copyright (c) 2026 Search1API). research-pro keeps its own
search backends; only the Jev judgment pattern is reused.

## Files

| File | Role |
|---|---|
| `scripts/lib/jev_candidates.mjs` | Rule-based keyword-query candidates (code proposes; Jev selects) |
| `scripts/lib/jev_client.mjs` | Minimal System One client (single POST, no retry, kill switch) |
| `scripts/lib/jev_judge.mjs` | `inferPlan()` (query/window/hints) + `rankResults()` (batched triage) |
| `scripts/lib/jev_trace.mjs` | Optional trace hook (`RESEARCH_PRO_RUN_ID`) |
| `scripts/jev_plan.mjs` | CLI: plan one search |
| `scripts/jev_rank.mjs` | CLI: score result rows |

## Usage

```bash
node scripts/jev_plan.mjs '{"request":"<sub-question>"}'
# → { ok, candidates, query{index,text,confidence}, window{choice},
#     targets[{id,p}], recommended{query,hints,window,threshold,fallback},
#     usage, model, provider, latencyMs }

node scripts/jev_rank.mjs '{"request":"...","results":[{"title":"...","snippet":"..."}]}'
# → { ok, scored[{index,id,p}], usage, model, latencyMs, (threshold, below)? }
```

Wire into a run: set `RESEARCH_PRO_RUN_ID` (from `trace.mjs init`) and both
CLIs append a `calls.jsonl` record (`tool: jev_plan|jev_rank`). Use
`recommended.query` + `recommended.hints` when invoking smart-search.

## Configuration

| Variable | Meaning |
|---|---|
| `TYPESAFE_API_KEY` / `JEV_API_KEY` | Same key; either name works (canonical + alias in `credentials.mjs`) |
| `TYPESAFE_MODEL` | Default `jev-latest` (observed `jev-1.13.0`, 2026-09) |
| `RESEARCH_PRO_JEV=off` | Kill switch; the layer reports unavailable and callers fall through |
| `RESEARCH_PRO_JEV_TIMEOUT_MS` | Request timeout, default 20000 |

`node scripts/doctor.mjs` reports `jev_judge: available|MISSING` underneath
`Capabilities`. Jev is not a search backend; `runnable` is unaffected.

## Calibration cautions (do not skip)

- **Thresholds are local defaults, not calibrated values.** `0.6` (hint
  selection) and any rank threshold come from outer examples; recalibrate on
  frozen local samples before using them as hard gates. `rankResults` scores
  sort and flag — they are **not evidence**.
- **Model behavior is versioned.** Log the returned `model` per call
  (observed `jev-1.13.0` via alias `jev-latest`; endpoint is alpha). Pin or
  record the snapshot when an experiment must be reproducible.
- **Known calibration direction (prior evidence, use as priors only):**
  choice/score answers tend to be overconfident, boolean/noul underconfident
  on OOD sets; Jev alone loses to vector search at reranking (fusion wins) —
  use as a fast gate/triage layer, not the decider.
- **No retry by design.** A failed call is recorded (trace) and surfaced as
  `{"ok":false,"error":...}`; callers must continue with the normal flow
  (fail-open).

## Measured so far (2026-09-21, this Mac)

| Check | Result |
|---|---|
| `inferPlan`-shaped call (7 questions, CJK state) | HTTP 200, 668 ms |
| `rerank`-shaped call (3 rows, 1 distractor) | HTTP 200, 590 ms; scores 0.98 / 0.96 / 0.01 |
| Cost | ~$0.00007 total (968 + 712 input tokens, `jev-1.13.0`) |

## A/B run (2026-09-21)

Two sub-questions, one naive baseline per question (as-typed query, `serp`/dataforseo
backend) versus one Jev-planned query (same backend); all four result sets scored
with `jev_rank`. Trace run `20260921T030349Z_research-pro-x-jev-judge_e9380a` (light mode).

| Sub-question | Arm | top-5 mean p | mean p | rows ≥ 0.5 | URL overlap |
|---|---|---|---|---|---|
| S1 Apple-Silicon community experience | A as-typed | 0.908 | 0.914 | 8/8 | 4 common / 12 |
| S1 | B planned | 0.924 | 0.926 | 8/8 | +4 new high-p finds (0.89–0.93) |
| S2 Jev community reports | A as-typed | 0.862 | 0.845 | 8/8 | 8 common / 8 |
| S2 | B planned | 0.854 | 0.839 | 8/8 | planned query = original (no change) |

Findings:

- Mechanism works end-to-end: plan (~0.65 s) → search → rank (~0.6–0.8 s); every
  call recorded in the run trace (`tool: jev_plan|jev_rank`, plus the searches).
- S1: the planned candidate kept the community signal and dropped the time
  phrase, producing equal-or-better relevance **plus** four additional high-p
  finds the naive query missed.
- S2: no candidate beat the original wording; Jev kept the original query —
  conservative behavior, no regression (the S2-B search hit the cross-run
  cache — same query — so it made no new backend call).
- Judge noise: identical rows scored ±0.01–0.02 between runs. Treat scores as
  triage signal; calibrate before any threshold decision.
- Environment note: Tavily was over its pay-as-you-go limit during the run, so
  executable hint routing was limited to non-Tavily backends and the comparison
  isolates query formulation on one backend. Hint recommendations themselves
  were sane (`S1 → deep, realtime, community`; `S2 → deep, community`).
