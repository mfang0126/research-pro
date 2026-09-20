# Budget and stopping

Status: active reference for candidate `3.19.1-mf`. Use this when research can branch, retry, delegate, or consume more time than the final answer deserves.

## Set a shared boundary

Before non-trivial external retrieval, write down a concrete per-task boundary: a wall-clock deadline or stop time, a visible call/request cap, and a delivery-time reserve. Choose the values from the user's deadline, the cost of calls, the risk of error, the number of live branches, and the time needed to write the result. If the user gave a limit, it wins. If no limit was given, use conservative task-specific values and state them briefly when they affect the work; never turn those values into universal defaults or quality quotas.

The boundary covers:

- exploration and query rewrites;
- reading and citation follow-up;
- retries and provider fallbacks;
- parallel branches or delegated work;
- local validation calls;
- enough time to deliver and explain the result.

Do not treat a round label or source count as the boundary. A short question can have high error cost; a long question can be answered from one applicable source.

## Make the deadline usable

Record the actual start time before readiness/setup for a bounded run. From the delivery deadline, subtract the time needed to synthesize, verify the scope of conclusions, write the report, finalize trace, and hand over; the remainder is the retrieval stop time. Keep a short running synthesis so delivery does not begin from an empty page. Choose the reserve from the actual output and recording work, not from the search backend's expected latency alone.

Before each dispatch and after each return, compare the actual clock with those boundaries. A new action is affordable only if its bounded duration, existing in-flight reservations, and remaining delivery work fit. Set the tool timeout accordingly when supported; if a tool cannot be bounded reliably, do not use it near the stop time. A failed call does not earn an extension.

At the retrieval stop time, stop starting retrieval and use the reserve to deliver what is supported. Do not spend the reserve polishing or adding optional checks while required report/trace work remains. If the final deadline is reached, hand over the current result and explicitly mark any incomplete record or unknown in-flight request. Record actual completion time; never backdate it or measure only until the last search. A missed deadline stays a failure of that constraint even when the answer is useful.

## Allocate before branching

Maintain the current count explicitly before the next retrieval decision: `remaining = total cap - consumed - still reserved`. Include actions already completed before this turn, failed and unhelpful calls, and all branches. Do not infer remaining capacity from the length of the newest branch alone. If the ledger is uncertain, reconstruct it from the available call records; do not assume a fresh allowance. A zero or negative remainder means no new retrieval: deliver the supported result and identify the remaining gap.

Before starting parallel actions, reserve a visible share for each branch and for delivery. An in-flight request consumes its reservation until it returns or is cancelled. A fallback uses the same branch budget. Do not let multiple workers assume the same remaining budget, and do not open a new branch to hide an overrun.

Count each visible subrequest in a combined or parallel call according to the provider/tool boundary. Before starting a long call, check the remaining wall-clock time, tool timeout, and delivery reserve. Hidden provider retries or requests that continue after cancellation are unknown usage; do not claim that a hard cap was respected until the backend state is observable. A cancellation request does not release a reservation while the request may still be running; release it only after completion or cancellation is confirmed.

If a branch discovers that its result cannot change the decision, stop it and return its useful evidence or failure. If a branch needs more budget, explain what decision-changing observation it is expected to obtain and whether the remaining budget can cover it; do not extend the budget solely to make the report look complete.

## Decide whether to continue

Continue when at least one of these is true and the shared budget and delivery reserve still cover the action:

- a high-impact claim has no suitable evidence;
- a new observation changed the object, mechanism, candidate set, or conclusion;
- an important source conflict has a plausible discriminating check;
- an access failure has a clear recovery that could change the answer;
- a user clarification changed the decision or constraints.

Stop when one of these is true; the budget cap and delivery reserve take precedence over a promising branch:

- the answer meets the stated use and remaining unknowns are immaterial;
- the next source would only repeat an existing lineage;
- the strongest available evidence is adequate and further searching is unlikely to change the decision;
- remaining work requires a user preference, authorization, environment, or experiment that is unavailable;
- the time/call budget or delivery reserve is reached;
- access or source disagreement remains unresolved and should be reported as a boundary.

"Enough" means the current intent is answered, the comparison or definition is coherent, important counterevidence has been considered where relevant, and the effect of remaining uncertainty is visible. It does not mean every subtopic or source has been collected.

## Handle retries and empty results

A zero-result or failed request is an observation about that query/provider/access path. Before retrying, identify the changed purpose: remove an over-specific qualifier, use domain language, switch to a source type that can answer the claim, or use a permitted extractor. A small bounded recovery may be justified by the remaining budget; it is never an automatic quota.

Record the original query/result and the changed attempt when trace is available. If both are empty or off-topic, preserve the unknown. Do not infer that a topic, product, or fact does not exist from one failed search.

## Deliver partial work honestly

When stopping before a full answer, choose the form that matches the evidence:

- **Direct:** enough evidence for the requested decision or explanation;
- **Conditional:** a result that holds under named version, environment, source, or preference conditions;
- **Unresolved:** the decisive evidence or user input is missing.

Each partial result should name the material gap, whether it blocks the decision, and the highest-value next check. Do not pad an under-supported answer with extra links, filler rounds, or a confident label.

## Trace the boundary

When tracing is enabled and a run was initialized, finalize it with the actual status and coverage. `completed_with_gaps`, `partial`, `truncated`, `failed`, and `cancelled` are useful outcomes. `completed` with `full` coverage is appropriate only when the trace and referenced artifacts support that claim; the runtime may downgrade an over-optimistic request. When `RESEARCH_PRO_TRACE=off`, skip finalization and disclose that persistent trace coverage is unavailable. See [operations.md](operations.md) for the command.
