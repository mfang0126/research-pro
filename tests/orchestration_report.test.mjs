import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  readRunRows,
  readCalls,
  aggregate,
  toolOf,
  PRICE_USD,
} from "../scripts/orchestration_report.mjs";
import * as nested from "../skills/research-pro/scripts/orchestration_report.mjs";

test("aggregate counts usage, degraded, errors, fallbacks, and fixed cost", () => {
  const rows = [
    { actual_tool: "tavily", requested_tool: "tavily", status: "ok", degraded: false, elapsed_ms: 900 },
    { actual_tool: "dataforseo", requested_tool: "tavily_official", status: "degraded", degraded: true, elapsed_ms: 3000 },
    { actual_tool: "dataforseo", requested_tool: "dataforseo", status: "ok", degraded: false, elapsed_ms: 15000 },
    { actual_tool: "grok_web", requested_tool: "grok_web", status: "error", degraded: false, error: "boom", elapsed_ms: 100 },
    { actual_tool: null, requested_tool: "jev_plan", status: "zero", degraded: false, elapsed_ms: 650 },
  ];
  const a = aggregate(rows);
  assert.equal(a.total, 5);
  assert.equal(a.degraded, 1);
  assert.equal(a.errors, 1);
  assert.equal(a.fallbacks, 1);
  assert.equal(a.tools.tavily.calls, 1);
  assert.equal(a.tools.dataforseo.calls, 2);
  assert.equal(a.tools.dataforseo.fallbacks, 1);
  assert.equal(a.variable_priced_calls, 1); // grok_web
  const expected = Number((PRICE_USD.tavily + 2 * PRICE_USD.dataforseo + PRICE_USD.jev_plan).toFixed(4));
  assert.equal(a.fixed_cost_usd, expected);
});

test("readRunRows respects the limit; readCalls skips malformed lines", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "orch-report-"));
  const runDir = path.join(home, "runs", "r1");
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(home, "run-log.jsonl"),
    JSON.stringify({ run_id: "r1", run_dir: runDir, question: "q1", ts: "t1" }) + "\n" +
      JSON.stringify({ run_id: "r2", run_dir: path.join(home, "runs", "r2"), question: "q2", ts: "t2" }) + "\n"
  );
  fs.writeFileSync(
    path.join(runDir, "calls.jsonl"),
    "{not-json}\n" + JSON.stringify({ actual_tool: "tavily", requested_tool: "tavily", status: "ok" }) + "\n"
  );
  const rows = readRunRows(home, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].run_id, "r2");
  const calls = readCalls(runDir);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actual_tool, "tavily");
});

test("root and nested report modules expose identical behavior", () => {
  assert.equal(typeof nested.aggregate, "function");
  const rows = [{ actual_tool: "dataforseo", requested_tool: "tavily", status: "degraded", degraded: true }];
  assert.deepEqual(aggregate(rows).tools, nested.aggregate(rows).tools);
  assert.deepEqual(PRICE_USD, nested.PRICE_USD);
});

test("toolOf falls back to requested_tool then hint then unknown", () => {
  assert.equal(toolOf({ actual_tool: "a", requested_tool: "b", hint: "c" }), "a");
  assert.equal(toolOf({ actual_tool: null, requested_tool: "b", hint: "c" }), "b");
  assert.equal(toolOf({ hint: "c" }), "c");
  assert.equal(toolOf({}), "unknown");
});
