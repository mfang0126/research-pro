# Worked patterns

Status: active reference for `3.21.0-mf`. These are small patterns for choosing the next action. They intentionally omit topic-specific answers and do not substitute for sealed evaluation cases.

## Authorized topic, unclear term

The user asks for research on an already authorized topic, but one term has several plausible meanings. Read any supplied context. If the distinction affects the answer, make a small definition lookup or explain the alternatives, then continue with the meaning that fits the user's purpose. Ask only if the alternatives would lead to different decisions and the context cannot resolve them.

## Known URL, narrow request

The user supplies one URL and asks for a summary. Read that URL with the appropriate extractor, state if the body is partial or unavailable, and summarize only what was actually read. Do not expand into a multi-source comparison unless the user asks for it or the original task already authorizes that broader work.

## Candidate list with a missing input/output constraint

Several candidates have been found, but the decisive constraint is unknown. Do not collect more candidates to avoid the decision. Ask the smallest question that distinguishes the route, or give conditional branches showing how the answer changes under each plausible constraint.

## Official promise versus local behavior

Documentation says a feature exists, while a local file, issue, or run suggests a different result. Keep the documentation as a source assertion and the local result as an observation. Align version and configuration, inspect the relevant implementation or reproduction, and report whether the conflict is resolved. Do not call the promise a local test result.

## Access failure with a useful alternative

A page is blocked or truncated, and a permitted source-level alternative could support the same claim. Record the access failure, use the alternative only for that purpose, and label the evidence role it provides. If the alternative cannot resolve the claim, stop with an explicit unread or partial boundary.

## Evidence already sufficient

The supplied material directly answers the user's stated question and its scope matches. Answer from it, cite the material, and state the remaining limit if one matters. Do not perform extra searches to satisfy a mode label or make the source list longer.

## Budget ends during a branch

One branch has evidence, another still lacks a decisive source, and the shared budget is exhausted. Preserve both outcomes, give the supported conditional result, name what the missing branch could change, and propose the smallest next validation. Do not reopen the branch or claim the gap is resolved.
