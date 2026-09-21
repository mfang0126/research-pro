#!/usr/bin/env node
/**
 * orchestration_report.mjs — search-orchestration observability over existing run traces.
 *
 * Read-only, no network. Reads run-log.jsonl + per-run calls.jsonl and reports:
 * per-tool usage, degraded/error/fallback counts, average latency, and a
 * fixed-price cost estimate where pricing is known (variable-priced providers
 * are counted separately).
 *
 * Usage:
 *   node scripts/orchestration_report.mjs [--runs 20] [--json]
 * Env: RESEARCH_PRO_HOME (default ~/.config/research-pro)
 *
 * Not computed: plan-adoption rate — jev_trace does not record recommended
 * hints (would need a jev_trace extension; see the orchestration plan D1a).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { researchProHome } from "./lib/trace.mjs";

/** Fixed per-call prices (USD) verified 2026-09-21; estimates only. */
export const PRICE_USD = {
  tavily: 0.008,
  tavily_official: 0.008,
  tavily_community: 0.008,
  dataforseo: 0.002,
  jev_plan: 0.0001,
  jev_rank: 0.0001,
};

/** Providers with usage-based pricing — counted, not priced. */
export const VARIABLE_PRICE = new Set([
  "tavily_research", "grok_web", "grok_x", "firecrawl", "youtube", "xhs",
]);

export function readRunRows(home, limit = 20) {
  const p = path.join(home, "run-log.jsonl");
  if (!fs.existsSync(p)) return [];
  const rows = [];
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      /* skip malformed line */
    }
  }
  return rows.slice(-limit);
}

export function readCalls(runDir) {
  const p = path.join(runDir, "calls.jsonl");
  if (!fs.existsSync(p)) return [];
  const out = [];
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

export function toolOf(row) {
  return row.actual_tool || row.requested_tool || row.hint || "unknown";
}

export function aggregate(callRows) {
  const byTool = {};
  let total = 0;
  let degraded = 0;
  let errors = 0;
  let fallbacks = 0;
  let fixedCost = 0;
  let variableCalls = 0;
  for (const row of callRows) {
    total += 1;
    const tool = toolOf(row);
    const t = (byTool[tool] ||= { calls: 0, degraded: 0, errors: 0, fallbacks: 0, elapsed_ms_sum: 0, elapsed_n: 0 });
    t.calls += 1;
    if (row.degraded || row.status === "degraded") {
      degraded += 1;
      t.degraded += 1;
    }
    if (row.status === "error" || row.error) {
      errors += 1;
      t.errors += 1;
    }
    if (row.actual_tool && row.requested_tool && row.actual_tool !== row.requested_tool) {
      fallbacks += 1;
      t.fallbacks += 1;
    }
    const ms = Number(row.elapsed_ms);
    if (Number.isFinite(ms)) {
      t.elapsed_ms_sum += ms;
      t.elapsed_n += 1;
    }
    if (PRICE_USD[tool] != null) fixedCost += PRICE_USD[tool];
    else if (VARIABLE_PRICE.has(tool)) variableCalls += 1;
  }
  const tools = Object.fromEntries(
    Object.entries(byTool)
      .sort((a, b) => b[1].calls - a[1].calls)
      .map(([k, v]) => [k, { ...v, avg_ms: v.elapsed_n ? Math.round(v.elapsed_ms_sum / v.elapsed_n) : null }])
  );
  return {
    total,
    degraded,
    errors,
    fallbacks,
    fixed_cost_usd: Number(fixedCost.toFixed(4)),
    variable_priced_calls: variableCalls,
    tools,
  };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes("--json");
  const runsIdx = args.indexOf("--runs");
  const limit = runsIdx >= 0 ? Number(args[runsIdx + 1]) || 20 : 20;
  const home = researchProHome();
  const runRows = readRunRows(home, limit);
  const perRun = [];
  const allCalls = [];
  for (const r of runRows) {
    const dir = r.run_dir || path.join(home, "runs", r.run_id || "");
    const calls = readCalls(dir);
    allCalls.push(...calls);
    perRun.push({
      run_id: r.run_id,
      question: (r.question || "").slice(0, 60),
      ts: r.ts,
      calls: calls.length,
      degraded_calls: calls.filter((c) => c.degraded || c.status === "degraded").length,
      fixed_cost_usd_est: Number(calls.reduce((s, c) => s + (PRICE_USD[toolOf(c)] || 0), 0).toFixed(4)),
    });
  }
  const report = {
    home,
    runs: perRun.length,
    calls_total: allCalls.length,
    aggregate: aggregate(allCalls),
    per_run: perRun,
  };
  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const a = report.aggregate;
  console.log(`orchestration report — home=${home}`);
  console.log(`runs=${perRun.length}  calls=${allCalls.length}  degraded=${a.degraded}  errors=${a.errors}  fallbacks=${a.fallbacks}`);
  console.log(`fixed-price cost estimate ≈ $${a.fixed_cost_usd}  (variable-priced calls counted: ${a.variable_priced_calls})`);
  console.log("per tool:");
  for (const [t, v] of Object.entries(a.tools)) {
    console.log(
      `  ${t.padEnd(16)} calls=${String(v.calls).padEnd(4)} degraded=${String(v.degraded).padEnd(4)} ` +
        `errors=${String(v.errors).padEnd(3)} fallbacks=${String(v.fallbacks).padEnd(3)} avg_ms=${v.avg_ms ?? "-"}`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
