# Research quality checklist

Status: active review aid for candidate `3.19.1-mf`. This is a set of questions, not a source-count, tool-count, round-count, score, or release gate.

## Intent and scope

- [ ] Does the result answer the user's stated purpose and requested shape?
- [ ] Are the object, version, date, jurisdiction, environment, and constraints clear enough for the conclusion?
- [ ] Did the research stay within the user's authorization?
- [ ] Are missing preferences, permissions, experiments, or external side effects identified?

## Evidence

- [ ] Does each decision-relevant claim have a source or local observation that directly supports it?
- [ ] Can the reader locate the relevant passage, data, code revision, runtime result, or timestamp?
- [ ] Is the evidence role clear: source assertion, observation, claim, inference, or recommendation?
- [ ] Are important counterexamples, corrections, competing explanations, or source conflicts addressed?
- [ ] Are repeated sources recognized as one lineage rather than counted as independent support?

## Access and limits

- [ ] Are refused, rate-limited, truncated, abstract-only, degraded, and unread sources labeled accurately?
- [ ] Does the wording avoid claiming full-page knowledge from a snippet or summary?
- [ ] Are version, freshness, workload, and transfer limits visible where they affect the decision?
- [ ] If a local effect is unknown, is a validation proposal kept separate from an observed result?

## Budget and stopping

- [ ] Were retries, fallbacks, parallel work, hidden usage, and delivery time treated as one shared budget?
- [ ] Did the next action have a stated reason and a plausible chance to change the answer?
- [ ] Did the work stop when evidence was sufficient, the budget ended, or a user decision was required?
- [ ] If incomplete, does the result state the exact gap and the highest-value next check?

## Trace and output safety

- [ ] Were script-backed retrievals checked with doctor and run through the appropriate wrapper/bridge?
- [ ] Were external calls recorded when trace was available, including failures and degraded paths?
- [ ] Are secrets, raw credentials, unsafe private paths, and unnecessary raw responses absent from the deliverable?
- [ ] Does final trace status match actual coverage and artifact availability?

An item can be marked not applicable with a short reason. A checklist review does not turn a conditional conclusion into a verified one.
