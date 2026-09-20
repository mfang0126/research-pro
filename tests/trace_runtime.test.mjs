import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as rootTrace from "../scripts/lib/trace.mjs";
import * as nestedTrace from "../skills/research-pro/scripts/lib/trace.mjs";
import {
  appendCall,
  finalizeRun,
  initRun,
} from "../scripts/lib/trace.mjs";

const TRACE_MODULE = fileURLToPath(new URL("../scripts/lib/trace.mjs", import.meta.url));
const TRACE_CLI = fileURLToPath(new URL("../scripts/trace.mjs", import.meta.url));
const TRACE_IMPLEMENTATIONS = [
  ["root", rootTrace],
  ["nested", nestedTrace],
];

function withTraceEnv(home, callback, { mode = "light", maxRawBytes } = {}) {
  const names = ["RESEARCH_PRO_HOME", "RESEARCH_PRO_TRACE", "RESEARCH_PRO_TRACE_MAX_RAW_BYTES"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.RESEARCH_PRO_HOME = home;
  process.env.RESEARCH_PRO_TRACE = mode;
  if (maxRawBytes == null) delete process.env.RESEARCH_PRO_TRACE_MAX_RAW_BYTES;
  else process.env.RESEARCH_PRO_TRACE_MAX_RAW_BYTES = String(maxRawBytes);
  try {
    return callback();
  } finally {
    for (const name of names) {
      if (previous[name] == null) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("forced raw capture stays valid JSON after bounded truncation", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "raw truncation" });
    const result = appendCall({
      run_id: run.run_id,
      query: "fixture",
      payload: { tool: "fixture", content: "x".repeat(10_000) },
      force_raw: true,
    });
    assert.equal(result.ok, true);
    const rawFile = path.join(run.run_dir, result.raw_path);
    const rawText = fs.readFileSync(rawFile, "utf8");
    assert.ok(Buffer.byteLength(rawText, "utf8") <= 1_200);
    const raw = JSON.parse(rawText);
    assert.equal(raw.truncated, true);
    assert.equal(raw.schema_version, 1);
  }, { mode: "full", maxRawBytes: 1_200 });
});

test("appendCall infers zero status when a backend returns no evidence", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "zero status" });
    const result = appendCall({
      run_id: run.run_id,
      payload: { tool: "fixture", results: [] },
    });
    assert.equal(result.ok, true);
    const [entry] = fs
      .readFileSync(path.join(run.run_dir, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(entry.status, "zero");
  });
});

test("appendCall counts record-shaped evidence and preserves lifecycle metadata", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "record metadata" });
    const result = appendCall({
      run_id: run.run_id,
      payload: {
        tool: "fixture",
        records: [{ id: "r1" }, { id: "r2" }],
        provider: "kimi-coding",
        model: "k3",
        request_id: "req-1",
        tool_call_id: "tool-1",
        attempt: 2,
        retry_count: 1,
        fallback_chain: ["kimi-coding/k3", "mimo"],
        error: "rate limit",
      },
      elapsed_ms: 125,
      round: 2,
      iteration: 3,
      error_type: "rate_limit",
    });
    assert.equal(result.ok, true);
    const [call] = fs
      .readFileSync(path.join(run.run_dir, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(call.result_count, 2);
    assert.equal(call.status, "error");
    assert.equal(call.provider, "kimi-coding");
    assert.equal(call.model, "k3");
    assert.equal(call.request_id, "req-1");
    assert.equal(call.tool_call_id, "tool-1");
    assert.equal(call.attempt, 2);
    assert.equal(call.retry_count, 1);
    assert.deepEqual(call.fallback_chain, ["kimi-coding/k3", "mimo"]);
    assert.equal(call.error_type, "rate_limit");
    assert.equal(call.round, 2);
    assert.equal(call.iteration, 3);
  });
});

test("appendCall deduplicates mixed result and record evidence", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "mixed evidence" });
    const result = appendCall({
      run_id: run.run_id,
      payload: {
        tool: "fixture",
        results: [{ id: "r1", url: "https://example.com/one" }],
        merged_results: [{ id: "r1", url: "https://example.com/one" }, { id: "r2", url: "https://example.com/two" }],
        records: [{ id: "r2", url: "https://example.com/two" }, { id: "r3" }],
      },
    });
    assert.equal(result.ok, true);
    const [call] = fs
      .readFileSync(path.join(run.run_dir, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(call.result_count, 3);
    assert.deepEqual(call.urls_top, ["https://example.com/one", "https://example.com/two"]);
  });
});

test("run ids do not expose credential-like question text", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const secret = "sk-1234567890abcdef";
    const run = initRun({ question: `x ${secret}` });
    assert.equal(run.run_id.includes(secret), false);
    assert.equal(run.run_id.includes("1234567890abcdef"), false);
    assert.equal(fs.existsSync(path.join(run.run_dir, "run.json")), true);
  });
});

test("appendCall rejects a path-traversal run id", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const result = appendCall({
      run_id: "../outside",
      payload: { tool: "fixture", results: [] },
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /run.?id|path|invalid/i);
    assert.equal(fs.existsSync(path.join(home, "outside")), false);
  });
});

test("appendCall redacts supplied lifecycle metadata before persistence", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "metadata redaction" });
    const secret = "fixture-secret-value";
    const result = appendCall({
      run_id: run.run_id,
      payload: { tool: "fixture", results: [{ id: "one" }] },
      source: `token=${secret}`,
      sub_q: `query token=${secret}`,
      provider: `provider token=${secret}`,
      request_id: `token=${secret}`,
    });
    assert.equal(result.ok, true);
    const text = fs.readFileSync(path.join(run.run_dir, "calls.jsonl"), "utf8");
    assert.equal(text.includes(secret), false);
    assert.match(text, /token=\[REDACTED\]/);
  });
});

function spawnChild(command, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", command], {
      encoding: "utf8",
      env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function spawnCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TRACE_CLI, ...args], {
      encoding: "utf8",
      env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("concurrent appenders preserve every call and counter", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  const previousHome = process.env.RESEARCH_PRO_HOME;
  const previousMode = process.env.RESEARCH_PRO_TRACE;
  process.env.RESEARCH_PRO_HOME = home;
  process.env.RESEARCH_PRO_TRACE = "light";
  try {
    const run = initRun({ question: "concurrency" });
    const child = `
      import { appendCall } from ${JSON.stringify(TRACE_MODULE)};
      const result = appendCall({
        run_id: process.env.TEST_RUN_ID,
        payload: { tool: "fixture", results: [{ url: "https://example.com/${crypto.randomBytes(2).toString("hex")}" }] },
      });
      if (!result.ok) process.exit(1);
    `;
    const children = await Promise.all(Array.from({ length: 12 }, () => spawnChild(child, {
      ...process.env,
      RESEARCH_PRO_HOME: home,
      RESEARCH_PRO_TRACE: "light",
      TEST_RUN_ID: run.run_id,
    })));
    for (const childResult of children) {
      assert.equal(childResult.status, 0, childResult.stderr || childResult.stdout);
    }
    const callsPath = path.join(run.run_dir, "calls.jsonl");
    const lines = fs.readFileSync(callsPath, "utf8").trim().split("\n");
    assert.equal(lines.length, children.length);
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));
    const meta = JSON.parse(fs.readFileSync(path.join(run.run_dir, "run.json"), "utf8"));
    assert.equal(meta.calls, children.length);
  } finally {
    if (previousHome == null) delete process.env.RESEARCH_PRO_HOME;
    else process.env.RESEARCH_PRO_HOME = previousHome;
    if (previousMode == null) delete process.env.RESEARCH_PRO_TRACE;
    else process.env.RESEARCH_PRO_TRACE = previousMode;
  }
});


test("finalizeRun preserves the recorded call count and explicit full coverage", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "finalize" });
    appendCall({ run_id: run.run_id, payload: { tool: "fixture", results: [] } });
    const finalized = finalizeRun({
      run_id: run.run_id,
      summary: "fixture",
      trace_coverage: "full",
      termination_reason: "completed",
    });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.meta.calls, 1);
    assert.equal(finalized.meta.status, "completed");
    assert.equal(finalized.meta.trace_coverage, "full");
    assert.equal(finalized.meta.termination_reason, "completed");
    const [runLog] = fs
      .readFileSync(path.join(home, "run-log.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(runLog.run_id, run.run_id);
    assert.equal(runLog.status, "completed");
    assert.equal(runLog.trace_coverage, "full");
    assert.equal(runLog.trace_path, finalized.meta.trace_path);
  });
});

test("finalizeRun does not claim completed when trace coverage is not asserted", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "coverage gap" });
    appendCall({ run_id: run.run_id, payload: { tool: "fixture", results: [] } });
    const finalized = finalizeRun({ run_id: run.run_id, summary: "fixture" });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.meta.status, "completed_with_gaps");
    assert.equal(finalized.meta.trace_coverage, "partial");
  });
});

test("finalizeRun rejects asserted full coverage when the trace file is missing", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "missing trace" });
    const finalized = finalizeRun({
      run_id: run.run_id,
      summary: "fixture",
      trace_path: path.join(run.run_dir, "missing-calls.jsonl"),
      trace_coverage: "full",
    });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.meta.status, "completed_with_gaps");
    assert.equal(finalized.meta.trace_coverage, "none");
    assert.deepEqual(finalized.meta.missing_artifacts, []);
  });
});

test("finalizeRun rejects a directory passed as the trace path", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "directory trace" });
    const traceDir = path.join(run.run_dir, "trace-dir");
    fs.mkdirSync(traceDir);
    const finalized = finalizeRun({
      run_id: run.run_id,
      trace_path: traceDir,
      trace_coverage: "full",
    });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.meta.status, "completed_with_gaps");
    assert.equal(finalized.meta.trace_coverage, "none");
  });
});

test("finalizeRun rejects empty or malformed trace content for full coverage", () => {
  for (const content of ["", "not-json\n"]) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
    withTraceEnv(home, () => {
      const run = initRun({ question: "invalid trace" });
      const tracePath = path.join(run.run_dir, "calls.jsonl");
      fs.writeFileSync(tracePath, content, "utf8");
      const finalized = finalizeRun({
        run_id: run.run_id,
        trace_path: tracePath,
        trace_coverage: "full",
      });
      assert.equal(finalized.ok, true);
      assert.equal(finalized.meta.status, "completed_with_gaps");
      assert.notEqual(finalized.meta.trace_coverage, "full");
    });
  }
});

test("finalizeRun normalizes completed termination when coverage has gaps", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "gap termination" });
    const finalized = finalizeRun({
      run_id: run.run_id,
      trace_coverage: "full",
      termination_reason: "completed",
    });
    assert.equal(finalized.meta.status, "completed_with_gaps");
    assert.equal(finalized.meta.termination_reason, "completed_with_gaps");
  });
});

test("finalizeRun does not treat artifact or manifest directories as files", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "directory artifacts" });
    appendCall({ run_id: run.run_id, payload: { tool: "fixture", results: [{ id: "one" }] } });
    const artifactDir = path.join(home, "artifact-dir");
    const manifestDir = path.join(home, "manifest-dir");
    fs.mkdirSync(artifactDir);
    fs.mkdirSync(manifestDir);
    const finalized = finalizeRun({
      run_id: run.run_id,
      trace_coverage: "full",
      artifact_paths: [artifactDir],
      source_manifest_path: manifestDir,
    });
    assert.equal(finalized.meta.status, "completed_with_gaps");
    assert.equal(finalized.meta.artifact_status, "incomplete");
    assert.ok(finalized.meta.missing_artifacts.includes(artifactDir));
    assert.ok(finalized.meta.missing_artifacts.includes(manifestDir));
  });
});

test("finalizeRun keeps failure status and termination reason aligned", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "failed run" });
    const finalized = finalizeRun({ run_id: run.run_id, status: "failed" });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.meta.status, "failed");
    assert.equal(finalized.meta.termination_reason, "failed");
  });
});

test("finalizeRun sanitizes extra metadata and protects terminal fields", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "final metadata" });
    appendCall({ run_id: run.run_id, payload: { tool: "fixture", results: [{ id: "one" }] } });
    const secret = "sk-abcdef1234567890";
    const finalized = finalizeRun({
      run_id: run.run_id,
      summary: `token=${secret}`,
      trace_coverage: "full",
      extra: { status: "failed", api_key: secret, note: `token=${secret}` },
    });
    assert.equal(finalized.ok, true);
    assert.equal(finalized.meta.status, "completed");
    const text = fs.readFileSync(path.join(run.run_dir, "run.json"), "utf8")
      + fs.readFileSync(path.join(home, "run-log.jsonl"), "utf8");
    assert.equal(text.includes(secret), false);
    assert.equal(text.includes("[REDACTED]"), true);
  });
});

test("raw capture removes nested secret fields and sensitive URL parameters", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "raw secret fields" });
    const secret = "fixture-secret-value";
    const result = appendCall({
      run_id: run.run_id,
      force_raw: true,
      payload: {
        tool: "fixture",
        token: secret,
        nested: { authorization: secret },
        results: [{ url: `https://example.com/path?token=${secret}` }],
      },
    });
    const raw = fs.readFileSync(path.join(run.run_dir, result.raw_path), "utf8");
    assert.equal(raw.includes(secret), false);
    assert.match(raw, /token=\[REDACTED\]/);
  });
});

for (const [label, implementation] of TRACE_IMPLEMENTATIONS) {
  test(`trace mirrors redact credential-shaped keys without dropping token metrics (${label})`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-mirror-"));
    withTraceEnv(home, () => {
      const secret = "fixture-secret-value";
      const run = implementation.initRun({
        question: `中文 trace https://question-user:${secret}@example.com/question`,
      });
      const result = implementation.appendCall({
        run_id: run.run_id,
        force_raw: true,
        payload: {
          tool: "fixture",
          usage: {
            token_count: 7,
            tokenCount: 8,
            apiKey: secret,
            apikey: secret,
            APIKey: secret,
            APIToken: secret,
            providerAPIToken: secret,
            IDToken: secret,
            APITokens: [secret],
            providerAPITokens: [secret],
            IDTokens: [secret],
            authentication: secret,
            providerAPIKeys: [secret],
            clientSecrets: secret,
            clientSecret: secret,
            client_secret: secret,
            TAVILY_API_KEY: secret,
            vendor_api_key: secret,
            oauth_client_secret: secret,
            x_auth_token: secret,
            "x-api-key": secret,
            "set-cookie": secret,
            "access-token": secret,
            credentials: [secret],
            cookies: [secret],
            apiKeys: [secret],
            sessionid: secret,
            tokens: [secret],
            prompt_tokens_details: { cached_tokens: 7, apiKey: secret },
            completion_tokens_details: { reasoning_tokens: 8, credentials: [secret] },
          },
          metrics: { token_count: 9 },
          author: "Ada Lovelace",
          authors: ["Ada Lovelace"],
          authority: "SQLite",
          authority_registry_id: "sqlite-official",
          content: `content https://content-user:${secret}@example.com/content and https://u:pa@ss@example.com/content ftp://ftp-user:ftp-pass@example.com/file postgresql://db-user:db-pass@example.com/database`,
          url: `https://trace-user:${secret}@example.com/trace`,
          results: [{ url: "https://example.com/trace" }],
        },
      });
      assert.equal(result.ok, true);
      const raw = JSON.parse(fs.readFileSync(path.join(run.run_dir, result.raw_path), "utf8"));
      assert.equal(raw.usage.token_count, 7);
      assert.equal(raw.usage.tokenCount, 8);
      assert.deepEqual(raw.metrics, { token_count: 9 });
      assert.equal(raw.usage.apiKey, undefined);
      assert.equal(raw.usage["access-token"], undefined);
      assert.equal(raw.usage.credentials, undefined);
      assert.equal(raw.usage.cookies, undefined);
      assert.equal(raw.usage.apiKeys, undefined);
      assert.equal(raw.usage.sessionid, undefined);
      assert.equal(raw.usage.tokens, undefined);
      assert.equal(raw.usage.prompt_tokens_details.cached_tokens, 7);
      assert.equal(raw.usage.prompt_tokens_details.apiKey, undefined);
      assert.equal(raw.usage.completion_tokens_details.reasoning_tokens, 8);
      assert.equal(raw.usage.completion_tokens_details.credentials, undefined);
      assert.equal(raw.author, "Ada Lovelace");
      assert.deepEqual(raw.authors, ["Ada Lovelace"]);
      assert.equal(raw.authority, "SQLite");
      assert.equal(raw.authority_registry_id, "sqlite-official");
      assert.equal(JSON.stringify(raw).includes(secret), false);

      const finalized = implementation.finalizeRun({
        run_id: run.run_id,
        summary: `summary https://summary-user:${secret}@example.com/summary`,
        report_text: `report https://report-user:${secret}@example.com/report`,
        trace_coverage: "full",
        tools_used: { token_count: 7, apiKey: secret, client_secret: secret },
        extra: { note: `extra https://extra-user:${secret}@example.com/extra` },
      });
      assert.equal(finalized.ok, true);
      assert.equal(finalized.meta.tools_used.token_count, 7);
      assert.equal(finalized.meta.tools_used.apiKey, undefined);
      const runText = fs.readFileSync(path.join(run.run_dir, "run.json"), "utf8");
      const traceText = fs.readFileSync(path.join(run.run_dir, "calls.jsonl"), "utf8");
      const reportText = fs.readFileSync(path.join(run.run_dir, "report.md"), "utf8");
      const logText = fs.readFileSync(path.join(home, "run-log.jsonl"), "utf8");
      const persisted = runText + traceText + reportText + logText;
      assert.equal(persisted.includes(secret), false);
      assert.doesNotMatch(persisted, /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s?#]*@/);
      assert.match(runText, /token_count/);
    }, { mode: "full" });
  });
}

test("finalizeRun fails closed when the required run log cannot be written", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "run log failure" });
    appendCall({ run_id: run.run_id, payload: { tool: "fixture", results: [{ id: "one" }] } });
    fs.mkdirSync(path.join(home, "run-log.jsonl"));
    const finalized = finalizeRun({ run_id: run.run_id, trace_coverage: "full" });
    assert.equal(finalized.ok, false);
    assert.equal(finalized.log_status, "failed");
    assert.equal(finalized.meta.status, "completed_with_gaps");
    assert.equal(finalized.meta.run_log_status, "failed");
  });
});

test("appendCall preserves contract and scope metadata", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  withTraceEnv(home, () => {
    const run = initRun({ question: "metadata" });
    const result = appendCall({
      run_id: run.run_id,
      payload: { tool: "fixture", results: [{ url: "https://example.com" }] },
      scope_key: "scope-a",
      contract_hash: "contract-a",
      sub_q: "Q1",
      round: 1,
    });
    assert.equal(result.ok, true);
    const call = JSON.parse(fs.readFileSync(path.join(run.run_dir, "calls.jsonl"), "utf8"));
    assert.equal(call.scope_key, "scope-a");
    assert.equal(call.contract_hash, "contract-a");
    assert.equal(call.sub_q, "Q1");
    assert.equal(call.round, 1);
  });
});

test("trace CLI exits nonzero when record-search cannot persist a run call", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  const payload = path.join(home, "payload.json");
  fs.writeFileSync(payload, JSON.stringify({ tool: "fixture", results: [{ id: "one" }] }), "utf8");
  const result = await spawnCli(["record-search", "--file", payload, "--query", "fixture", "--hint", "quick"], {
    ...process.env,
    RESEARCH_PRO_HOME: home,
    RESEARCH_PRO_TRACE: "light",
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.debug.ok, false);
  assert.equal(output.debug.error, "no_run_id");
});

test("trace CLI append exits nonzero when no run can be resolved", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-trace-"));
  const result = await spawnCli(["append", "--payload", JSON.stringify({ tool: "fixture", results: [] })], {
    ...process.env,
    RESEARCH_PRO_HOME: home,
    RESEARCH_PRO_TRACE: "light",
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.debug.ok, false);
  assert.equal(output.debug.error, "no_run_id");
});
