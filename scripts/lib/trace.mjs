/**
 * research-pro side-channel search trace (debug / comparison).
 * Never throws into the research path — callers should still try/catch.
 *
 * Layout:
 *   $RESEARCH_PRO_HOME/runs/<run_id>/
 *     run.json
 *     calls.jsonl
 *     raw/<call_id>.json   (only when mode=full or force_raw)
 *     report.md            (optional finalize)
 *
 * Env:
 *   RESEARCH_PRO_HOME          default ~/.config/research-pro
 *   RESEARCH_PRO_RUN_ID         active run
 *   RESEARCH_PRO_TRACE          off | light | full  (default light)
 *   RESEARCH_PRO_TRACE_MAX_RAW_BYTES  default 200000
 *   RESEARCH_PRO_TRACE_TOP_N           default 10
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

export function researchProHome() {
  return process.env.RESEARCH_PRO_HOME || path.join(os.homedir(), ".config", "research-pro");
}

export function traceMode() {
  const m = (process.env.RESEARCH_PRO_TRACE || "light").toLowerCase();
  if (m === "0" || m === "false" || m === "off" || m === "none") return "off";
  if (m === "full" || m === "raw" || m === "2") return "full";
  return "light";
}

export function topN() {
  const n = Number(process.env.RESEARCH_PRO_TRACE_TOP_N || 10);
  return Number.isFinite(n) && n > 0 ? Math.min(50, Math.floor(n)) : 10;
}

export function maxRawBytes() {
  const n = Number(process.env.RESEARCH_PRO_TRACE_MAX_RAW_BYTES || 200000);
  return Number.isFinite(n) && n > 1000 ? Math.floor(n) : 200000;
}

function nowIso() {
  return new Date().toISOString();
}

function slug(s, max = 40) {
  return String(s || "research")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max) || "research";
}

export function newRunId(question = "") {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const rand = crypto.randomBytes(3).toString("hex");
  return `${ts}_${slug(question, 24)}_${rand}`;
}

export function runDir(runId) {
  return path.join(researchProHome(), "runs", runId);
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function atomicWriteJson(file, obj) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function appendJsonl(file, obj) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(obj) + "\n", { mode: 0o600 });
}

function redactSecrets(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^\s"']+/gi, "$1=[REDACTED]")
    .replace(/tvly-[A-Za-z0-9]+/g, "tvly-[REDACTED]")
    .replace(/sk-[A-Za-z0-9\-_]{10,}/g, "sk-[REDACTED]");
}

function extractResults(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.merged_results)) return payload.merged_results;
  if (Array.isArray(payload.batches)) {
    const out = [];
    for (const b of payload.batches) {
      if (Array.isArray(b?.results)) out.push(...b.results);
    }
    return out;
  }
  return [];
}

function topUrls(results, n) {
  const urls = [];
  for (const r of results) {
    const u = r?.url || r?.link || r?.href;
    if (u && !urls.includes(u)) urls.push(u);
    if (urls.length >= n) break;
  }
  return urls;
}

/**
 * Start a research run. Returns { run_id, run_dir, mode }.
 */
export function initRun({
  question = "",
  depth = "standard",
  sub_questions = [],
  tier = null,
  extra = {},
} = {}) {
  const mode = traceMode();
  if (mode === "off") {
    return { run_id: null, run_dir: null, mode: "off", skipped: true };
  }
  const run_id = newRunId(question);
  const dir = runDir(run_id);
  ensureDir(path.join(dir, "raw"));
  const meta = {
    run_id,
    ts_start: nowIso(),
    question,
    depth,
    sub_questions,
    tier,
    mode,
    home: researchProHome(),
    status: "running",
    ...extra,
  };
  atomicWriteJson(path.join(dir, "run.json"), meta);
  // pointer for convenience
  try {
    atomicWriteJson(path.join(researchProHome(), "current-run.json"), {
      run_id,
      run_dir: dir,
      mode,
      ts: meta.ts_start,
    });
  } catch {
    /* ignore */
  }
  return { run_id, run_dir: dir, mode, skipped: false };
}

/**
 * Append one search call. payload = smart-search JSON or any result object.
 * Never throws critical; returns { ok, call_id, error? }.
 */
export function appendCall({
  run_id = process.env.RESEARCH_PRO_RUN_ID || null,
  payload = null,
  query = null,
  hint = null,
  tool = null,
  requested_tool = null,
  degraded = null,
  elapsed_ms = null,
  sub_q = null,
  round = null,
  status = "ok",
  error = null,
  contributed = null,
  force_raw = false,
  source = "agent",
} = {}) {
  try {
    const mode = traceMode();
    if (mode === "off") return { ok: true, skipped: true, reason: "trace_off" };
    if (!run_id) {
      // fall back to current-run pointer
      try {
        const cur = JSON.parse(
          fs.readFileSync(path.join(researchProHome(), "current-run.json"), "utf8"),
        );
        run_id = cur.run_id;
      } catch {
        return { ok: false, error: "no_run_id" };
      }
    }
    const dir = runDir(run_id);
    if (!fs.existsSync(dir)) ensureDir(path.join(dir, "raw"));

    const results = extractResults(payload);
    const call_id = `${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
    const q =
      query ||
      payload?.query ||
      (typeof payload?.input === "string" ? payload.input : null) ||
      "";
    const h =
      hint ||
      payload?.hint ||
      (Array.isArray(payload?.hints) ? payload.hints.join(",") : null);
    const actualTool = tool || payload?.tool || payload?.meta?.tool || null;
    const reqTool = requested_tool || payload?.requested_tool || null;
    const deg =
      degraded != null
        ? degraded
        : Boolean(payload?.degraded || (payload?.meta && payload.meta.gaps?.length));
    const elapsed =
      elapsed_ms != null
        ? elapsed_ms
        : payload?.elapsed_ms ?? payload?.meta?.tool_time_ms ?? null;
    const result_count =
      results.length ||
      payload?.result_count ||
      payload?.meta?.count ||
      0;
    const urls = topUrls(results, topN());

    let raw_path = null;
    if (mode === "full" || force_raw) {
      try {
        let rawText = JSON.stringify(payload ?? {}, null, 2);
        rawText = redactSecrets(rawText);
        if (Buffer.byteLength(rawText, "utf8") > maxRawBytes()) {
          rawText =
            rawText.slice(0, maxRawBytes()) +
            `\n/* truncated at ${maxRawBytes()} bytes */\n`;
        }
        raw_path = path.join("raw", `${call_id}.json`);
        fs.writeFileSync(path.join(dir, raw_path), rawText, { mode: 0o600 });
      } catch (e) {
        raw_path = null;
        error = error || `raw_write_failed:${e.message}`;
      }
    }

    const entry = {
      ts: nowIso(),
      run_id,
      call_id,
      source,
      round,
      sub_q,
      query: typeof q === "string" ? q.slice(0, 2000) : q,
      hint: h,
      requested_tool: reqTool,
      actual_tool: actualTool,
      degraded: deg,
      elapsed_ms: elapsed,
      result_count,
      status: error ? "error" : status,
      error: error ? redactSecrets(String(error)).slice(0, 500) : null,
      contributed,
      urls_top: urls,
      raw_path,
      mode,
    };
    appendJsonl(path.join(dir, "calls.jsonl"), entry);

    // best-effort update run.json counters
    try {
      const runPath = path.join(dir, "run.json");
      const meta = JSON.parse(fs.readFileSync(runPath, "utf8"));
      meta.calls = (meta.calls || 0) + 1;
      meta.ts_last_call = entry.ts;
      meta.tools = meta.tools || {};
      const tkey = actualTool || "unknown";
      meta.tools[tkey] = (meta.tools[tkey] || 0) + 1;
      atomicWriteJson(runPath, meta);
    } catch {
      /* ignore */
    }

    return { ok: true, call_id, run_id, raw_path };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export function finalizeRun({
  run_id = process.env.RESEARCH_PRO_RUN_ID || null,
  summary = null,
  confidence = null,
  tools_used = null,
  tools_contributed = null,
  report_path = null,
  report_text = null,
  extra = {},
} = {}) {
  try {
    if (!run_id) {
      try {
        run_id = JSON.parse(
          fs.readFileSync(path.join(researchProHome(), "current-run.json"), "utf8"),
        ).run_id;
      } catch {
        return { ok: false, error: "no_run_id" };
      }
    }
    const dir = runDir(run_id);
    const runPath = path.join(dir, "run.json");
    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(runPath, "utf8"));
    } catch {
      meta = { run_id };
    }
    meta.ts_end = nowIso();
    meta.status = "done";
    if (summary != null) meta.summary = summary;
    if (confidence != null) meta.confidence = confidence;
    if (tools_used != null) meta.tools_used = tools_used;
    if (tools_contributed != null) meta.tools_contributed = tools_contributed;
    Object.assign(meta, extra);

    if (report_text) {
      fs.writeFileSync(path.join(dir, "report.md"), report_text, { mode: 0o600 });
      meta.report_path = path.join(dir, "report.md");
    } else if (report_path && fs.existsSync(report_path)) {
      try {
        fs.copyFileSync(report_path, path.join(dir, "report.md"));
        meta.report_path = path.join(dir, "report.md");
      } catch {
        meta.report_path = report_path;
      }
    }

    // call stats
    try {
      const lines = fs
        .readFileSync(path.join(dir, "calls.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean);
      meta.calls = lines.length;
      const tools = {};
      let degraded = 0;
      for (const line of lines) {
        try {
          const o = JSON.parse(line);
          const t = o.actual_tool || "unknown";
          tools[t] = (tools[t] || 0) + 1;
          if (o.degraded) degraded += 1;
        } catch {
          /* ignore */
        }
      }
      meta.tools = tools;
      meta.degraded_calls = degraded;
    } catch {
      /* ignore */
    }

    atomicWriteJson(runPath, meta);

    // also append compact row to run-log.jsonl (Phase 5 companion)
    try {
      appendJsonl(path.join(researchProHome(), "run-log.jsonl"), {
        ts: meta.ts_end,
        run_id,
        question: meta.question,
        depth: meta.depth,
        confidence: meta.confidence,
        calls: meta.calls,
        tools: meta.tools,
        tools_used: meta.tools_used,
        tools_contributed: meta.tools_contributed,
        degraded_calls: meta.degraded_calls,
        mode: meta.mode,
        run_dir: dir,
      });
    } catch {
      /* ignore */
    }

    return { ok: true, run_id, run_dir: dir, meta };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export function pruneRuns({ days = 14 } = {}) {
  const root = path.join(researchProHome(), "runs");
  if (!fs.existsSync(root)) return { ok: true, removed: 0 };
  const cutoff = Date.now() - days * 86400000;
  let removed = 0;
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name);
    try {
      const st = fs.statSync(p);
      if (!st.isDirectory()) continue;
      if (st.mtimeMs < cutoff) {
        fs.rmSync(p, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: true, removed, days };
}
