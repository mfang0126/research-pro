# Search orchestration

Status: active reference for `3.21.0-mf`. Division of labor: [search-actions-and-access.md](search-actions-and-access.md) owns the intent→action guidance; this file owns the **capability catalog**, **provider chains**, **budgets**, and **convergence discipline**. Doctrine: semantic classification decides the route; deterministic rules (chains, dedupe, breaker, ledger) enforce it.

Prices and availability below were verified on 2026-09-21 against provider pricing pages, account billing, and live probes. Re-verify after quota events or provider changes.

## Capability catalog

Every retrieval capability reachable from research-pro. "Family" = pipeline identity for outage/cost grouping.

| # | Capability | Family | Mechanism | Returns | Unit cost | Latency | Evidence role | Status / limits |
|---|---|---|---|---|---|---|---|---|
| 1 | `quick` | TAVILY | Tavily basic search (`tvly` CLI) | Clean web results + snippets | $0.008/search | ~1 s | discovery | Quota shared with #2/#3/#4 |
| 2 | `official` | TAVILY | Tavily with `{q} official documentation` bias | Web results biased to official docs | $0.008 | ~1 s | discovery (official) | Same pipeline as #1 — not independent |
| 3 | `community` | TAVILY | Tavily with `{q} site:reddit.com` bias | Reddit-biased results | $0.008 | ~1 s | discovery (community) | Discovery only — reading needs #10/#9 |
| 4 | `deep` | TAVILY | Tavily Research (mini/pro) | Synthesized multi-source report | $0.12–$2.00 | ~42 s | synthesis (secondary) | Cost cliff; ≤1/sub-question (Deep); never treated as raw evidence |
| 5 | `realtime` | XAI | Grok web search | Current web/news results | xAI usage | ~2–6 s | discovery (current) | Independent pipeline |
| 6 | `social` | XAI | Grok `x_search` | X/Twitter posts & threads | xAI usage | ~2–6 s | first-hand social | Only X route; can return 0 legitimately |
| 7 | `video` | YOUTUBE | YouTube Data API search | Video list + metadata | key quota | ~1–2 s | media discovery | Transcript is a separate read step (see #16) |
| 8 | `serp` | GOOGLE-RAW | DataForSEO Google organic live/advanced | Raw engine results | $0.002 live / $0.0012 priority / $0.0006 standard | 1–17 s | discovery (most faithful raw) | `site:` honored; **`time_range` is accepted but has no effect** (verified 2026-09-21: past_week / past_hour result sets identical to unfiltered) — do not rely on it for recency; CJK via `language_code`; other engines (baidu/naver/seznam) need new endpoints — out of scope; `--limit <10` is a no-op (minimum depth 10) |
| 9 | `scrape` | SCRAPE | Firecrawl → firecrawl-waitfor → kimi-webbridge | Page body (markdown) | 1 credit/page (free tier 1k/mo; paid $0.0032–0.005) | 3–30 s | reading (citable) | Reddit blocked by CF → use #10 |
| 10 | `reddit-cli` | SCRAPE | research-pro native Reddit reader | Reddit thread content | free | 1–2 s | reading (Reddit) | Bypasses the CF block |
| 11 | host `web_search` | HOST | Hermes host tool | Web results | host backend key | ~1 s | discovery | Rides the host's backend (Tavily on this machine — shares #1's outage domain) |
| 12 | host `web_extract` | HOST | Hermes host tool | Page text | host backend key | unstable | reading | Same caveat as #11 |
| 13 | `curl` | LOCAL | Direct HTTP fetch | Raw page/HTML | free | ms–s | reading (static) | Works regardless of provider quotas |
| 14 | `xhs` | XHS | MediaCrawler | Xiaohongshu posts | free/local | ~ s | social (CJK) | Optional; requires local install |
| 15 | Tavily Extract | TAVILY | `run-with-creds.mjs tvly extract <url>` | Page text via Tavily | $0.008/5 URLs | ~2–5 s | reading | Shares the Tavily quota pool |
| 16 | Video transcript | LOCAL | yt-dlp / API transcript | Video speech text | free/local | ~5–30 s | reading (video) | Read-step for #7 |
| 17 | Retrieval cache | LOCAL | `retrieval_cache.py` / search cache | Prior results (0-cost) | $0 | instant | dedupe/recall | Check before any paid call |

Surfaces not part of this loop catalog (stated explicitly): the MCP endpoint (`scripts/mcp_server.py`) exposes the same capabilities to external agents; host `x_search` and browser tools exist but research work routes social/browser via #6 and the scrape chain. Direct adapters `grok_search.mjs` (= #5/#6), `research.mjs` (= #4), `reddit-cli.js` (= #10) add no independence.

## Capability relationships

### A. Pipeline families → outage/cost domains (not an independence proof)

- **TAVILY:** #1, #2, #3, #4, #15 (+ host #11/#12 while they ride Tavily). One outage domain — demonstrated 2026-09-21: a single quota cap killed all of them at once.
- **GOOGLE-RAW:** #8. **XAI:** #5, #6. **YOUTUBE:** #7. **SCRAPE/READING:** #9, #10, #13 (partially independent of each other). **LOCAL:** #13, #16, #17, the webbridge leg of #9.
- **Convergence rule:** source independence is judged by **lineage** (see [evidence-and-claims.md](evidence-and-claims.md)): the same press release, dataset, benchmark, or original post counts as ONE source even when seen through two families. Families tell you who else goes down with whom and who you are paying; cross-family retrieval is how you *find* independent lineages, not proof that you did.

### B. Substitution (same need — pick one per mode, never run both)

- General discovery: **#1 ↔ #8** (research mode: #8 first for cost; interactive mode: #1 first for speed).
- Official: #2 ↔ #8 with the same `official documentation` suffix ↔ direct fetch (#9/#13).
- Community: #3 ↔ #8 + `site:reddit.com` (then read with #10).
- Deep synthesis: #4 ↔ multiple #8 rounds + reading — an approximation, not an equivalent.
- Reading a URL: #9 ↔ #12 ↔ #13 ↔ #15 ↔ webbridge, by page type (JS/walled → webbridge; static → curl).

### C. Complements (no substitute exists)

#6 social (X only), #7 + #16 video + transcript, #17 cache (dedupe layer), and the reading vs discovery stages themselves.

### D. Stage flow

`jev_plan` → discovery slots → `jev_rank` (triage) → reading → citation. Video adds a transcript hop (#7 → #16); Reddit adds a thread-read hop (#3 → #10).

### E. Fallback edges (chain implementation)

- Tavily family → DataForSEO (implemented in smart-search: Tavily-family failure retries the same intent on `serp`, preserving the hint's query bias; the failed intent is disclosed via `degrade_reason` / `fallback_used`).
- `deep` (tavily_research) is **not** auto-downgraded — a synthesized report cannot silently become discovery; on failure the agent escalates per the ladder (serp rounds + P5.5). Covered by a regression test.
- #9 chain: firecrawl → firecrawl-waitfor → kimi-webbridge.
- Reading: host #12 is unstable → fall back to #13 / #9 / #15.
- Mode orders: research = #8 first; interactive = #1 first. Both valid.

### F. Anti-patterns (disallowed)

- Counting same-family results as independent sources.
- Counting the same upstream artifact seen through two families as independent (lineage rule).
- Firing parallel same-purpose calls on two hints (duplicate spend; the cache may mask it).
- Treating #4's synthesized report as raw evidence; treating snippets as read pages.
- Feeding rows with empty title and URL into triage or reports (filter first).

## The ladder (P0–P6)

- **P0 Plan:** one `jev_plan` call per sub-question when available (~0.6 s, fail-open). Advisory targets: `quick/official/deep/realtime/community/social/video`; `serp` is not a Jev target.
- **P1 Discover:** `serp` by default; `quick` only for sub-2s interactivity. Exactly one.
- **P2 Targeted slots:** official / realtime / community / social / video — only when the cheap layer cannot answer; typical ≤3.
- **P3 Read:** bodies for candidates that may be cited; typical ≤2; discovery ≠ reading.
- **P4 Triage:** `jev_rank` orders/flags; filter empty rows; scores are not evidence.
- **P5 Synthesis:** `deep` for genuine synthesis only, under a raised ledger; default 0 (Standard), ≤1 (Deep).
- **P5.5 Counter-evidence:** one counter/strongest-critique search for Deep and whenever claim risk is material.
- **P6 Convergence:** ≥2 independent lineages per sub-question.

## By-gap routing

| Gap | First action | Escalate to | Notes |
|---|---|---|---|
| General facts/background | #8 `serp` | #1 `quick` when speed matters | cheapest first |
| Official docs/rules/pricing | #2 `official`, or #8 with suffix | direct-fetch official domain (#9/#13) | primary-domain read is strongest |
| Latest/current state | #5 `realtime` | #8 with date-checked snippets (`time_range` ineffective) | verify dates in results |
| Practitioner/community experience | #3 `community`, or #8 + `site:reddit.com` | #10 `reddit-cli` | |
| Social reactions | #6 `social` | — | only route |
| Video/talks | #7 `video` | #16 transcript | |
| Known-URL body | #9 `scrape` | #12 / #13 / #15 | |
| Multi-source synthesis | #8 rounds + read 2–3 sources | #4 `deep` (capped) + P5.5 | cost cliff |
| Search demand / SEO data | #8 `serp` | — | DataForSEO native |
| CJK language queries | #8 + `--lang` (e.g. `zh`) | — | Google endpoint; other engines separate task |

## Budgets

Budgets are per-task ledger boundaries, not universal quotas ([budget-and-stopping.md](budget-and-stopping.md)). Starting defaults for a typical task (state deviations):

- **Standard:** ≈ ≤6 retrieval calls (search/scrape/extract; `jev_plan`/`jev_rank` counted separately at ~$0.0001 each) and ≤ ~$0.03 paid spend per sub-question with DataForSEO-first routing and free-tier scrape credits.
- **Deep:** ≈ ≤12 retrieval calls; ≤1 Tavily-research call (its own $0.12–$2.00 scale — raise the ledger to include it); ≤ $0.05 non-deep paid per sub-question.
- Typical shape: P1 (1) + P2 (≤3) + P3 (≤2) ≤ 6.

## Measured so far (2026-09-21)

| Check | Result |
|---|---|
| DataForSEO `serp` live, billed | $0.002/call (account statement: 4 calls = $0.008) |
| `site:` operator pass-through | 10/10 results from the target domain |
| `time_range` (past_week, past_hour) | **No effect** — result sets identical to unfiltered across 3 probed calls; not usable for recency |
| CJK query with `language_code=zh` | Chinese-language result set |
| Tavily-family outage handling | `quick` auto-falls back to `serp` with `fallback_used: "dataforseo"` and full degrade metadata |
| Jev plan/rank | 618–693 ms, `jev-1.13.0`, ~$0.0001/call |

## Observability

`node scripts/orchestration_report.mjs [--runs 20] [--json]` — per-tool usage, degraded/error/fallback counts, average latency, per-run and total fixed-price cost estimates over existing run traces (read-only, no network). Plan-adoption rate is not computed yet — it requires a `jev_trace` extension that records the recommended hints.
