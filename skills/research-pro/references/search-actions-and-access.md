# Search actions and access

> **Language:** English (default) · [中文](search-actions-and-access.zh-CN.md)

Status: active reference for `3.21.0-mf`. Choose an action from the current understanding gap. This is a routing aid, not a mandatory workflow or a backend ranking.

## Choose the next action

| What is missing | Useful first action | Change route when |
|---|---|---|
| A term or distinction is unclear | Definition, adjacent concepts, and representative examples | The meanings imply different decisions or user goals; ask with the alternatives visible |
| The method or candidate space is unknown | Small exploratory search to form a temporary map | A category matters to the decision; inspect representative candidates instead of collecting names |
| An object, version, or claim is known | Targeted official, code, case, or specification lookup | The target is found; read the original and stop broad discovery |
| A candidate list misses the user's input/output need | Check coverage against the actual use case | A missing capability changes the choice; search for that capability directly |
| A result is empty or off-topic | Inspect wording, synonyms, date, domain, and source scope; make a small bounded rewrite if useful | The same route stays empty or begins returning a different topic; record the gap |
| A citation, video, issue, or project is relevant | Follow the source or cited original selectively | The source does not support the claim; downgrade it or follow the next relevant link |
| Only local effect is unknown | Design or run an authorized local experiment | No authorization, environment, or safe test exists; deliver the validation plan |
| The decision is already supported | Stop and answer | Remaining unknown could change the decision or its safety boundary |

Several actions can be combined when they address different gaps. They do not become mandatory merely because the question is labelled comparison, latest, or deep.

## smart-search hints

The wrapper accepts hints such as:

| Hint | Retrieval intent |
|---|---|
| `quick` | Ordinary web discovery |
| `official` | Prefer official or primary-domain discovery |
| `deep` | Ask the configured deep research backend for a synthesis |
| `realtime` | Prefer current web/news coverage |
| `community` | Look for community discussion or Reddit material |
| `social` | Look for X/Twitter material when available |
| `scrape` | Extract a known URL |
| `video` | Find video material and, when useful, a transcript |
| `serp` | Search-demand or SERP data |

Combinations express multiple retrieval intents. The hint does not guarantee an official source, community coverage, current results, page access, or a particular provider. A degraded response is a lead with a changed evidence role; it cannot silently become a strong current or social claim.

Use direct adapters only when they are available and the action is justified. `grok_search.mjs` supports `--web` and `--x`; `research.mjs` calls the Tavily research endpoint; other third-party CLIs need the credentials shim described in [operations.md](operations.md). Do not write a fixed tool matrix into a report as if it were a finding.

## Local-first and source reading

For questions about "our" code, configuration, product, history, or current state, read the relevant local files and revision first. A local path, test, or runtime result can answer a narrow implementation question without external search. If external context is still needed, state which local gap it should address.

For a web source, separate discovery from reading:

1. Decide what claim the page might support.
2. Retrieve the page, transcript, issue, or source at the depth that claim needs.
3. Check the actual body or relevant segment, not only title, snippet, URL, or generated summary.
4. Record the locator, version/date, access status, and any omitted context.

Use a video when its speech, screen behavior, or cited source is the evidence; do not force every video into a fixed category. Use GitHub for code, releases, issues, pull requests, design discussions, and operating evidence according to the claim. Use SEO or popularity data only when the user's question is about search demand, reach, or market signals.

## Access failures and bounded recovery

Name the observed failure:

- `403`/permission or login required;
- `429`/rate limited;
- JavaScript-only or browser-dependent body;
- truncated body or abstract only;
- malformed/unsafe URL;
- topic mismatch;
- provider error or degraded fallback;
- content was retrieved but does not support the claim.

Choose a recovery that addresses that failure: an approved extractor for a known URL, a primary mirror, a transcript, a source-level citation, a narrower query, or a different provider. Repeating the same request without a changed purpose spends budget without improving evidence. A failed read does not authorize unrelated discovery.

If a small recovery is worthwhile, record the original failure and the changed action. If it is not worthwhile or the shared budget is low, mark the source as unread/partial and continue with the evidence that is actually available. Never describe a snippet, abstract, fallback, or search result as the full page unless it was read and supports that wording.
