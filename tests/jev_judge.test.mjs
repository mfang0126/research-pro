import test from "node:test";
import assert from "node:assert/strict";

import { buildCandidates as rootCandidates } from "../scripts/lib/jev_candidates.mjs";
import { buildCandidates as nestedCandidates } from "../skills/research-pro/scripts/lib/jev_candidates.mjs";
import * as rootJudge from "../scripts/lib/jev_judge.mjs";
import * as nestedJudge from "../skills/research-pro/scripts/lib/jev_judge.mjs";
import { systemOne, jevStatus, JevError } from "../scripts/lib/jev_client.mjs";
import { inferPlan, rankResults, TARGET_PROB_THRESHOLD } from "../scripts/lib/jev_judge.mjs";

const REAL_FETCH = globalThis.fetch;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Run fn with env overrides + a mock fetch, restoring both afterwards. */
async function withMock(env, handler, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === null) delete process.env[k];
    else process.env[k] = v;
  }
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts, calls.length);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = REAL_FETCH;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const BASE_ENV = { TYPESAFE_API_KEY: "test-key", TYPESAFE_MODEL: null, RESEARCH_PRO_JEV: null };

test("buildCandidates keeps the original first and strips time/source/filler (CJK + EN)", () => {
  const zh = "最近三个月 r/LocalLLaMA 和 HN 上，大家对 Apple Silicon 跑本地大模型怎么看？";
  const zhC = rootCandidates(zh);
  assert.equal(zhC[0], zh.replace(/[?？。.]\s*$/, ""), "candidate 0 is the tidied request");
  assert.ok(zhC.length >= 2, "expected at least one stripped candidate");
  assert.ok(zhC.some((c) => !c.includes("最近三个月")), "time phrase should be stripped somewhere");
  assert.equal(new Set(zhC.map((c) => c.toLowerCase())).size, zhC.length, "candidates must be unique");

  const en = "What are people saying about the Framework laptop on Reddit?";
  const enC = rootCandidates(en);
  assert.equal(enC[0], en.replace(/[?？。.]\s*$/, ""), "candidate 0 is the tidied request");
  assert.ok(enC.some((c) => /framework/i.test(c) && !/people saying/i.test(c)));
});

test("root and nested mirror modules behave identically", () => {
  const samples = [
    "最近三个月 r/LocalLLaMA 和 HN 上，大家对 Apple Silicon 跑本地大模型怎么看？",
    "What are people saying about the Framework laptop on Reddit?",
    "New papers on speculative decoding",
  ];
  for (const s of samples) {
    assert.deepEqual(rootCandidates(s), nestedCandidates(s), s);
  }
  assert.equal(typeof rootJudge.inferPlan, typeof nestedJudge.inferPlan);
  assert.equal(typeof rootJudge.rankResults, typeof nestedJudge.rankResults);
  assert.deepEqual(
    rootJudge.DEFAULT_TARGETS.map((t) => t.id),
    nestedJudge.DEFAULT_TARGETS.map((t) => t.id)
  );
});

test("systemOne sends one batched call and parses answers", async () => {
  await withMock(BASE_ENV, () =>
    jsonResponse({
      model: "jev-1.13.0",
      answers: { q1: { type: "noul", noul: 0.9 } },
      usage: { input_tokens: 10, output_tokens: 2 },
    }), async () => {
    const res = await systemOne({ a: 1 }, { q1: { type: "noul", instructions: "x" } });
    assert.equal(res.model, "jev-1.13.0");
    assert.equal(res.answers.q1.noul, 0.9);
    assert.equal(res.usage.input_tokens, 10);
    assert.ok(typeof res.latencyMs === "number");
  });
});

test("systemOne posts to the right URL with auth, record-shaped questions, default model", async () => {
  await withMock(BASE_ENV, () => jsonResponse({ answers: {}, usage: {} }), async (calls) => {
    await systemOne({ a: 1 }, { q1: { type: "noul", instructions: "x" } });
    const { url, opts } = calls[0];
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(opts.method, "POST");
    assert.match(opts.headers.Authorization, /^Bearer .+/);
    const sent = JSON.parse(opts.body);
    assert.equal(sent.model, "jev-latest");
    assert.ok(sent.questions && !Array.isArray(sent.questions));
    assert.equal(sent.state.a, 1);
  });
});

test("systemOne rejects array questions and hides provider bodies on errors", async () => {
  await withMock(BASE_ENV, () => jsonResponse({}, 200), async () => {
    await assert.rejects(
      systemOne({}, []),
      /questions must be a plain object \(record\), not an array/
    );
  });
  await withMock(BASE_ENV, () => new Response("internal-detail-not-for-users", { status: 402 }), async () => {
    await assert.rejects(systemOne({}, { q: { type: "noul", instructions: "x" } }), (err) => {
      assert.ok(err instanceof JevError);
      assert.equal(err.status, 402);
      assert.ok(!err.message.includes("internal-detail"), "provider body must not leak");
      return true;
    });
  });
});

test("RESEARCH_PRO_JEV=off disables the layer", async () => {
  const saved = process.env.RESEARCH_PRO_JEV;
  process.env.RESEARCH_PRO_JEV = "off";
  try {
    assert.equal(jevStatus().disabled, true);
    assert.equal(jevStatus().available, false);
    await assert.rejects(systemOne({}, { q: { type: "noul", instructions: "x" } }), /disabled/);
  } finally {
    if (saved === undefined) delete process.env.RESEARCH_PRO_JEV;
    else process.env.RESEARCH_PRO_JEV = saved;
  }
});

test("inferPlan selects query/window/hints in one call", async () => {
  const answers = {
    window: { type: "choice", choice: "month", confidence: 0.9, probabilities: { month: 0.9, any: 0.1 } },
    target_quick: { type: "noul", noul: 0.9 },
    target_official: { type: "noul", noul: 0.05 },
    target_deep: { type: "noul", noul: 0.4 },
    target_realtime: { type: "noul", noul: 0.7 },
    target_community: { type: "noul", noul: 0.95 },
    target_social: { type: "noul", noul: 0.1 },
    target_video: { type: "noul", noul: 0.2 },
    query: { type: "choice", choice: "c1", confidence: 0.4, probabilities: { c0: 0.1, c1: 0.6, c2: 0.3 } },
  };
  await withMock(BASE_ENV, () => jsonResponse({ model: "jev-1.13.0", answers, usage: { input_tokens: 100, output_tokens: 10 } }), async (calls) => {
    const out = await inferPlan({ request: "r", candidates: ["a", "b", "c"] });
    assert.equal(calls.length, 1, "plan must be a single batched call");
    assert.equal(out.ok, true);
    assert.equal(out.query.text, "b");
    assert.equal(out.window.choice, "month");
    assert.equal(out.recommended.fallback, false);
    assert.deepEqual(out.recommended.hints, ["quick", "realtime", "community"]);
    assert.equal(out.recommended.threshold, TARGET_PROB_THRESHOLD);
    assert.equal(out.usage.input_tokens, 100);
  });
});

test("inferPlan falls back to quick when no target crosses the threshold", async () => {
  const answers = {
    window: { type: "choice", choice: "any", confidence: 0.5, probabilities: {} },
    query: { type: "choice", choice: "c0", confidence: 0.5, probabilities: {} },
  };
  await withMock(BASE_ENV, () => jsonResponse({ answers, usage: {} }), async () => {
    const out = await inferPlan({ request: "r", candidates: ["a", "b"] });
    assert.equal(out.recommended.fallback, true);
    assert.deepEqual(out.recommended.hints, ["quick"]);
    assert.equal(out.window.choice, "any");
  });
});

test("rankResults batches at 40 and merges scores; threshold groups rows", async () => {
  const results = Array.from({ length: 45 }, (_, i) => ({ id: `id${i}`, title: `t${i}`, snippet: `s${i}` }));
  await withMock(BASE_ENV, (url, opts, n) => {
    const sent = JSON.parse(opts.body);
    const answers = {};
    for (const key of Object.keys(sent.questions)) {
      answers[key] = { type: "noul", noul: n === 1 ? 0.8 : 0.9 };
    }
    return jsonResponse({ model: "jev-1.13.0", answers, usage: { input_tokens: 5, output_tokens: 1 } });
  }, async (calls) => {
    const out = await rankResults({ request: "r", results, threshold: 0.85 });
    assert.equal(calls.length, 2, "45 rows must split into 40 + 5");
    assert.equal(out.batches, 2);
    assert.equal(out.count, 45);
    assert.equal(out.scored.length, 45);
    assert.equal(out.scored[0].p, 0.8);
    assert.equal(out.scored[44].p, 0.9);
    assert.equal(out.scored[44].id, "id44");
    assert.equal(out.below.length, 40);
    assert.equal(out.usage.input_tokens, 10);
  });
});

test("rankResults with zero rows makes no API call", async () => {
  await withMock(BASE_ENV, () => {
    throw new Error("fetch must not be called");
  }, async () => {
    const out = await rankResults({ request: "r", results: [] });
    assert.equal(out.ok, true);
    assert.equal(out.count, 0);
    assert.equal(out.batches, 0);
  });
});
