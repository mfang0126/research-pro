/**
 * jev_judge.mjs — the two research-pro judgments: plan and triage rank.
 *
 * 1. inferPlan(): the code proposes keyword-query candidates and hint
 *    targets; Jev selects the query, the time window, and which hints are
 *    wanted, in ONE batched call (pattern: jev-search `inferIntent`).
 * 2. rankResults(): batched noul questions score each result row for
 *    relevance to the request (pattern: jev-search `rerank`). Scores sort
 *    and flag rows; they are not evidence and not a hard gate.
 *
 * Thresholds here are local defaults, NOT calibrated values. See
 * references/jev-judge.md before turning any of them into a hard decision.
 */
import { buildCandidates } from "./jev_candidates.mjs";
import { systemOne } from "./jev_client.mjs";

export const WINDOWS = [
  { id: "week", description: "the last seven days" },
  { id: "month", description: "the last 30 days" },
  { id: "quarter", description: "the last 90 days" },
  { id: "any", description: "any time" },
];

/**
 * smart-search hint vocabulary, with the yes/no question Jev answers for
 * each. Wording follows jev-search's per-source ask style.
 */
export const DEFAULT_TARGETS = [
  {
    id: "quick",
    question: "Would a general web search (news, articles, blogs, docs) help answer this request?",
    yes: "The request is a general question, or asks for news, articles, coverage, docs or blog posts",
    no: "The request only makes sense on a specific platform such as Reddit, GitHub, arXiv or YouTube",
  },
  {
    id: "official",
    question: "Does the request want official, first-party or authoritative sources?",
    yes: "The request asks for official documentation, standards, filings, or vendor/government sources",
    no: "The request asks for community experience, opinions or general coverage rather than official sources",
  },
  {
    id: "deep",
    question: "Does the request need a deeper multi-source research pass rather than a quick lookup?",
    yes: "An open-ended, comparative or system-level question whose answer needs several independent sources",
    no: "A single fact, definition or narrow lookup",
  },
  {
    id: "realtime",
    question: "Does the request ask about very recent events or the current state (last days or weeks)?",
    yes: "The request names a recent time window, or asks about latest/current/breaking information",
    no: "The request asks about a stable topic without a time cue",
  },
  {
    id: "community",
    question: "Would practitioner or community discussion (forums, Reddit, Hacker News, user reports) fit this request?",
    yes: "The request asks what users, developers or people say, or wants real-world experience, pitfalls or opinions",
    no: "The request is a factual lookup, or asks for official sources, code or papers",
  },
  {
    id: "social",
    question: "Are social media posts (X/Twitter) likely to hold relevant first-hand or timely discussion?",
    yes: "The topic is actively discussed on X/Twitter, or the request asks for reactions, announcements or live commentary",
    no: "The topic is not social-media oriented",
  },
  {
    id: "video",
    question: "Would videos, talks, tutorials or transcripts help answer this request?",
    yes: "The request asks for talks, tutorials, demos, reviews or explainers that exist as video",
    no: "The answer needs text sources (docs, papers, code, data) rather than video",
  },
];

/** Uncalibrated local default for recommending a hint. */
export const TARGET_PROB_THRESHOLD = 0.6;
/** Rows per rerank call (mirrors jev-search). */
export const RERANK_BATCH = 40;

function normalizeCandidates(candidates, request) {
  const list = Array.isArray(candidates) && candidates.length ? candidates : buildCandidates(request);
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const v = String(c || "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.slice(0, 10);
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) return DEFAULT_TARGETS;
  const wanted = new Set(
    targets
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
  );
  const picked = DEFAULT_TARGETS.filter((t) => wanted.has(t.id));
  return picked.length ? picked : DEFAULT_TARGETS;
}

/**
 * Plan one search: which keyword query, which time window, which hints.
 *
 * @param {{request: string, now?: string, candidates?: string[], targets?: string[]}} input
 * @param {{threshold?: number, model?: string, timeoutMs?: number}} [opts]
 */
export async function inferPlan(input = {}, opts = {}) {
  const request = String(input.request || "").trim();
  if (!request) throw new Error("inferPlan: request is required");

  const candidates = normalizeCandidates(input.candidates, request);
  const targets = normalizeTargets(input.targets);
  const now = String(input.now || new Date().toISOString().slice(0, 10));

  const questions = {};

  const windowCriteria = {};
  for (const w of WINDOWS) windowCriteria[w.id] = w.description;
  questions.window = {
    type: "choice",
    instructions:
      "Does the request in `request` ask for recent results, and if so how recent? Judge only from what the request says or clearly implies; `now` is the current date. A request with no time cue wants any time.",
    criteria: windowCriteria,
  };

  for (const t of targets) {
    questions[`target_${t.id}`] = {
      type: "noul",
      instructions: `About \`request\`: ${t.question}`,
      criteria: { true: t.yes, false: t.no },
    };
  }

  if (candidates.length > 1) {
    const criteria = {};
    candidates.forEach((c, i) => {
      criteria[`c${i}`] = c;
    });
    questions.query = {
      type: "choice",
      instructions:
        "Which candidate in `candidates` is the best keyword query to send to a web search engine so the results match what the user is asking for in `request`? Prefer the candidate that keeps the subject and drops words about time, sources or phrasing that a search engine would treat as keywords.",
      criteria,
    };
  }

  const state = {
    request,
    now,
    candidates: Object.fromEntries(candidates.map((c, i) => [`c${i}`, c])),
  };

  const res = await systemOne(state, questions, opts);

  const windowAnswer = res.answers.window;
  const windowChoice =
    windowAnswer?.type === "choice" && WINDOWS.some((w) => w.id === windowAnswer.choice)
      ? windowAnswer.choice
      : "any";

  let queryIndex = 0;
  let queryConfidence = null;
  let queryProbabilities = {};
  const queryAnswer = res.answers.query;
  if (queryAnswer?.type === "choice") {
    const parsed = Number(String(queryAnswer.choice).replace(/^c/, ""));
    queryIndex = Number.isInteger(parsed) && parsed >= 0 && parsed < candidates.length ? parsed : 0;
    queryConfidence = typeof queryAnswer.confidence === "number" ? queryAnswer.confidence : null;
    queryProbabilities = queryAnswer.probabilities || {};
  }

  const targetProbs = targets.map((t) => {
    const a = res.answers[`target_${t.id}`];
    return { id: t.id, p: a?.type === "noul" ? a.noul : 0 };
  });

  const threshold = typeof opts.threshold === "number" ? opts.threshold : TARGET_PROB_THRESHOLD;
  const wanted = targetProbs.filter((t) => t.p >= threshold).map((t) => t.id);
  const fallback = wanted.length === 0;

  return {
    ok: true,
    request,
    candidates,
    query: {
      index: queryIndex,
      text: candidates[queryIndex],
      confidence: queryConfidence,
      probabilities: queryProbabilities,
    },
    window: {
      choice: windowChoice,
      confidence: windowAnswer?.confidence ?? null,
      probabilities: windowAnswer?.probabilities ?? {},
    },
    targets: targetProbs,
    recommended: {
      query: candidates[queryIndex],
      hints: fallback ? ["quick"] : wanted,
      window: windowChoice,
      threshold,
      fallback,
    },
    usage: res.usage,
    provider: res.provider,
    model: res.model,
    latencyMs: res.latencyMs,
  };
}

/**
 * Score result rows for relevance to the request (triage only).
 *
 * @param {{request: string, results: Array<{id?: string, source?: string, title?: string, snippet?: string}>, threshold?: number}} input
 * @param {{batchSize?: number, model?: string, timeoutMs?: number}} [opts]
 */
export async function rankResults(input = {}, opts = {}) {
  const request = String(input.request || "").trim();
  if (!request) throw new Error("rankResults: request is required");
  const results = Array.isArray(input.results) ? input.results : [];
  const threshold =
    typeof input.threshold === "number" ? input.threshold : typeof opts.threshold === "number" ? opts.threshold : null;

  if (results.length === 0) {
    return {
      ok: true,
      request,
      count: 0,
      scored: [],
      usage: { input_tokens: 0, output_tokens: 0 },
      provider: "typesafe",
      model: null,
      batches: 0,
      latencyMs: 0,
    };
  }

  const batchSize = Number(opts.batchSize || RERANK_BATCH) || RERANK_BATCH;
  const batches = [];
  for (let i = 0; i < results.length; i += batchSize) {
    batches.push(results.slice(i, i + batchSize));
  }

  const responses = await Promise.all(
    batches.map((batch) => {
      const questions = {};
      batch.forEach((_, i) => {
        questions[`r${i}`] = {
          type: "noul",
          instructions: `Is \`results[${i}]\` about the subject the user asked for in \`request\`?`,
          criteria: {
            true: "The title or snippet discusses the same subject the user asked about, even briefly or as one of several topics",
            false:
              "The result is about something else that only shares words with the request (a different meaning of the same word, a different product, a person with the same name) or is unrelated",
          },
        };
      });
      const state = {
        request,
        results: batch.map((it) => ({
          source: it?.source ?? "",
          title: it?.title ?? "",
          snippet: it?.snippet ?? "",
        })),
      };
      return systemOne(state, questions, opts);
    })
  );

  const usage = { input_tokens: 0, output_tokens: 0 };
  let latencyMs = 0;
  responses.forEach((r) => {
    usage.input_tokens += r.usage.input_tokens;
    usage.output_tokens += r.usage.output_tokens;
    latencyMs = Math.max(latencyMs, r.latencyMs || 0);
  });

  const scored = [];
  let offset = 0;
  responses.forEach((res, b) => {
    batches[b].forEach((item, i) => {
      const a = res.answers[`r${i}`];
      scored.push({
        index: offset + i,
        id: item?.id ?? null,
        p: a?.type === "noul" ? a.noul : 0,
      });
    });
    offset += batches[b].length;
  });
  scored.sort((a, b) => a.index - b.index);

  const out = {
    ok: true,
    request,
    count: results.length,
    scored,
    usage,
    provider: responses[0].provider,
    model: responses[0].model,
    batches: batches.length,
    latencyMs,
  };
  if (threshold != null) {
    out.threshold = threshold;
    out.below = scored.filter((s) => s.p < threshold);
  }
  return out;
}
