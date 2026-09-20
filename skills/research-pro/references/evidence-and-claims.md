# Evidence and claims

Status: active reference for candidate `3.19.1-mf`. Use this when deciding whether a source supports a statement or whether a recommendation should remain conditional.

## Keep the objects separate

Use plain labels in working notes and reports:

| Object | Meaning | Safe wording |
|---|---|---|
| Source assertion | What a source says it does, found, measured, or promises | "The documentation states ..." |
| Observation | What the agent actually read, ran, saw, or recorded under stated conditions | "In this version/run, I observed ..." |
| Research claim | A statement supported by one or more relevant sources or observations | "The available evidence supports ..." |
| Inference | A conclusion that combines claims through assumptions or interpretation | "This suggests ... because ..." |
| Decision or recommendation | A choice for a named context and risk tolerance | "For this use, I would ... subject to ..." |

Do not silently promote one row into another. A source can be authoritative for an interface definition and still be weak evidence for performance. A local observation can be precise for one configuration and still be too narrow for a general reliability claim.

## Strong reference test

For a decision-relevant claim, check the relationship between the claim and the source rather than assigning a permanent quality label to a platform or author:

1. **Directness:** Does the material address this claim, or only a neighboring topic?
2. **Traceability:** Can a reader locate the passage, page, data row, code revision, timestamp, or runtime record?
3. **Method and credibility:** Are the input, measurement, method, version, and possible interests visible enough to assess?
4. **Scope match:** Do object, version, date, jurisdiction, environment, workload, and task match the conclusion?
5. **Challenge:** Is there relevant independent support, a counterexample, correction, or competing explanation?

The cost of being wrong and the distance of the inference determine how much checking is appropriate. Do not turn a source count into a quality score. Several copies of one source are still one source.

For a numeric comparison, keep the measured quantity, unit, condition, and bound direction attached to the value. Equal units do not imply equivalent quantities; a source measurement, an inferred target, and a user limit have different roles. Preserve the original constraint in the final recommendation, and label any additional estimate as an inference rather than silently promoting it into an acceptance criterion.

## Choose evidence for the claim

| Claim type | Useful evidence | Boundary to preserve |
|---|---|---|
| Definition, interface, policy, or version behavior | Applicable official documentation, specification, release note, and source code when needed | A declared feature is not proof of performance or successful local operation |
| Academic mechanism or measured effect | Original study, methods/data, correction history, replication, and a suitable review | A benchmark does not automatically transfer to another workload |
| Current implementation behavior | Fixed revision, call path, tests, configuration, and runtime output | A file or README alone does not prove end-to-end behavior |
| Failure, maintenance, or engineering tradeoff | Reproduction, issue/PR, maintainer explanation, transparent postmortem, configuration, and outcome | One incident does not establish prevalence; one success does not establish reliability |
| User experience or operating practice | Relevant interview, transcript, demonstration, or community report with context | A transcript or demo may omit conditions and does not prove long-term performance |
| Adoption, demand, or satisfaction | Defined metric, population, denominator, time window, and independent data | Stars, search volume, comments, and popularity are not interchangeable metrics |

## Independence and disagreement

Group sources that repeat the same press release, dataset, benchmark, or original post. Treat them as one lineage until an independent method or observation adds information. When sources conflict, align definitions, version, sample, environment, measurement, and time before choosing a side. If the conflict remains decision-relevant, report both explanations and the missing test.

When a user correction changes the object, scope, or intended decision, remove dependent claims from the current argument and keep their history as superseded. Do not preserve a citation merely because it is already collected.

## Report the boundary

Match the scope of each sentence to the portion and modality actually inspected. A transcript supports what the speech says; it does not establish what the screen shows. An abstract or retrieved excerpt does not establish what is absent from the full paper. A code snippet does not establish what the complete system implements. The same limit applies to negative claims: "the available excerpt does not establish X" is different from "the source contains no X."

Before broadening a negative statement, identify what would have to be inspected to support it and whether that inspection could change the user's decision. If not, keep the narrower statement. If it could, retrieve the relevant missing portion within budget; no task must inspect every modality or the entire source by default.

Attach evidence close to the claim it supports. Name what was not checked:

- page or source access was blocked, truncated, or limited to an abstract;
- the evidence is a source assertion rather than an independent observation;
- the version, date, or environment differs;
- a recommendation depends on a user preference that is still unknown;
- an experiment is proposed but has not been run.

Prefer a narrow supported sentence such as "this version completed the task in the observed configuration" over an unsupported generalization such as "the tool is reliable." A conditional recommendation is valid when its conditions and next check are explicit.

For a deeper draft evidence model, see the dated archival documents in this directory only when the task is specifically about that history. They are not a required ledger or schema for ordinary Research Pro work.
