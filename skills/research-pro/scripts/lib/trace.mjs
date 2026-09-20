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
  return `${ts}_${slug(redactSecrets(question), 24)}_${rand}`;
}

export function runDir(runId) {
  const value = String(runId || "");
  if (!/^[A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9._\-\u4e00-\u9fff]{0,239}$/u.test(value)) {
    throw new Error("invalid_run_id");
  }
  if (redactSecrets(value) !== value) throw new Error("unsafe_run_id");
  return path.join(researchProHome(), "runs", value);
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

function sleepMs(ms) {
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, ms);
}

function withFileLock(file, callback) {
  ensureDir(path.dirname(file));
  const lockFile = `${file}.lock`;
  let fd = null;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      fd = fs.openSync(lockFile, "wx", 0o600);
      break;
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
      try {
        if (Date.now() - fs.statSync(lockFile).mtimeMs > 60000) fs.unlinkSync(lockFile);
      } catch {
        /* another writer owns/removes it */
      }
      sleepMs(10);
    }
  }
  if (fd === null) throw new Error("trace_lock_timeout");
  try {
    return callback();
  } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }
}

function appendJsonl(file, obj) {
  withFileLock(file, () => {
    fs.appendFileSync(file, JSON.stringify(obj) + "\n", { mode: 0o600 });
  });
}

function updateRunMeta(runPath, updater) {
  return withFileLock(runPath, () => {
    const meta = JSON.parse(fs.readFileSync(runPath, "utf8"));
    updater(meta);
    atomicWriteJson(runPath, meta);
    return meta;
  });
}

function boundedRawJson(payload, maxBytes) {
  const safePayload = sanitizeTraceValue(payload ?? {}) || {};
  let rawText = redactSecrets(JSON.stringify(safePayload, null, 2));
  const originalBytes = Buffer.byteLength(rawText, "utf8");
  if (originalBytes <= maxBytes) return rawText;

  const makeEnvelope = (prefix) => JSON.stringify({
    schema_version: 1,
    truncated: true,
    original_bytes: originalBytes,
    max_bytes: maxBytes,
    raw_prefix: prefix,
  }, null, 2);
  let low = 0;
  let high = rawText.length;
  let best = makeEnvelope("");
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = makeEnvelope(rawText.slice(0, middle));
    if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

export function redactSecrets(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s?#]*@/g, "$1")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/((?:^|[\s?&])(?:token|sig|signature|session|access[_-]?token|api[_-]?key|key|auth|authorization|cookie|set[-_]?cookie|password|secret|client[-_]?secret|credential)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key|secret|token|password|authorization|cookie|set[-_]?cookie|client[-_]?secret|credential)\s*[:=]\s*["']?[^\s"']+/gi, "$1=[REDACTED]")
    .replace(/tvly-[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9\-_]{10,}/g, "[REDACTED]");
}

const SENSITIVE_TRACE_KEY = /(?:^|_)(?:authorization|cookie(?:s)?|set_cookie(?:s)?|password|passwd|secret(?:s)?|client_secret(?:s)?|credential(?:s)?|api_key(?:s)?|apikey(?:s)?|x_api_key(?:s)?|api_token(?:s)?|access_token(?:s)?|refresh_token(?:s)?|bearer_token(?:s)?|token(?:s)?|sig(?:nature)?|login|session(?:_?ids?)?|private_key(?:s)?|raw_headers?)(?:_|$)/i;
const SENSITIVE_TRACE_AUTH_KEY = /(?:^|_)auth(?:_|$)/i;
const SENSITIVE_TRACE_COMPACT_STEM = /authorization|authentication|cookie|password|passwd|secret|credential|apikey|accesstoken|refreshtoken|authtoken|bearertoken|privatekey|session|rawheader/i;
const USAGE_METRIC_TRACE_KEY = /^(?:token_count|prompt_tokens|completion_tokens|total_tokens|input_tokens|output_tokens|cached_tokens|reasoning_tokens|cache_read_tokens|cache_write_tokens|tokens_used|token_usage|input_token_count|output_token_count|cached_token_count|reasoning_token_count|cache_read_token_count|cache_write_token_count|prompt_token_count|completion_token_count|total_token_count|audio_tokens|image_tokens|video_tokens|accepted_prediction_tokens|rejected_prediction_tokens|cache_creation_input_tokens|cache_read_input_tokens)$/i;
const USAGE_CONTAINER_TRACE_KEY = /^(?:usage|provider_usage|usage_details|prompt_tokens_details|completion_tokens_details|input_tokens_details|output_tokens_details|cache_creation_details|cache_read_details|cache_write_details)$/i;

function isSensitiveTraceKey(key) {
  const normalized = String(key).replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/-/g, "_").toLowerCase();
  if (USAGE_METRIC_TRACE_KEY.test(normalized) || USAGE_CONTAINER_TRACE_KEY.test(normalized)) return false;
  return SENSITIVE_TRACE_KEY.test(normalized)
    || SENSITIVE_TRACE_AUTH_KEY.test(normalized)
    || SENSITIVE_TRACE_COMPACT_STEM.test(normalized.replace(/_/g, ""));
}

function sanitizeTraceValue(value, depth = 0) {
  if (value == null) return null;
  if (depth > 5) return null;
  if (typeof value === "string") return redactSecrets(value).slice(0, 2000);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeTraceValue(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (isSensitiveTraceKey(key)) continue;
      out[key] = sanitizeTraceValue(child, depth + 1);
    }
    return out;
  }
  return null;
}

function traceField(value, max = 2000) {
  if (value == null) return null;
  if (typeof value === "string") return redactSecrets(value).slice(0, max);
  return sanitizeTraceValue(value);
}

function firstObserved(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function normalizeTraceArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean).slice(0, 20);
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  return [];
}

function classifyError(value) {
  if (!value) return null;
  const text = String(value).toLowerCase();
  if (/quota|credit|spend|403/.test(text)) return "quota";
  if (/rate.?limit|429|too many requests/.test(text)) return "rate_limit";
  if (/timeout|timed out|deadline/.test(text)) return "timeout";
  if (/auth|unauthorized|forbidden|401/.test(text)) return "auth";
  if (/network|fetch|connection|dns|econn/.test(text)) return "network";
  if (/invalid|parse|schema|validation/.test(text)) return "validation";
  return "unknown";
}

function extractResults(payload) {
  if (!payload || typeof payload !== "object") return [];
  const values = [];
  for (const key of ["results", "merged_results"]) {
    if (Array.isArray(payload[key])) values.push(...payload[key]);
  }
  if (Array.isArray(payload.batches)) {
    for (const b of payload.batches) {
      if (Array.isArray(b?.results)) values.push(...b.results);
    }
  }
  return uniqueEvidence(values);
}

function extractRecords(payload) {
  if (!payload || typeof payload !== "object") return [];
  const values = [];
  for (const key of ["records", "merged_records"]) {
    if (Array.isArray(payload[key])) values.push(...payload[key]);
  }
  if (Array.isArray(payload.batches)) {
    for (const batch of payload.batches) {
      if (Array.isArray(batch?.records)) values.push(...batch.records);
    }
  }
  return uniqueEvidence(values);
}

function uniqueEvidence(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const fingerprint = value.url || value.link || value.href || value.id || JSON.stringify(value);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(value);
  }
  return out;
}

function topUrls(results, n) {
  const urls = [];
  for (const r of results) {
    const u = r?.url || r?.link || r?.href;
    const safeUrl = u ? redactSecrets(String(u)) : "";
    if (safeUrl && !urls.includes(safeUrl)) urls.push(safeUrl);
    if (urls.length >= n) break;
  }
  return urls;
}

function hasEvidence(payload, results) {
  if (results.length || payload?.content || payload?.body_read) return true;
  return extractRecords(payload).length > 0;
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
  const reserved = new Set([
    "run_id", "ts_start", "question", "depth", "sub_questions", "tier", "mode", "home", "status",
    "trace_schema_version", "trace_path", "run_log_path",
  ]);
  const safeExtra = extra && typeof extra === "object"
    ? Object.fromEntries(Object.entries(extra).filter(([key]) => !reserved.has(key)))
    : {};
  const traceExtra = sanitizeTraceValue(safeExtra) || {};
  const tracePath = path.join(dir, "calls.jsonl");
  const runLogPath = path.join(researchProHome(), "run-log.jsonl");
  const meta = {
    ...traceExtra,
    run_id,
    ts_start: nowIso(),
    question: redactSecrets(String(question)).slice(0, 2000),
    depth,
    sub_questions: sanitizeTraceValue(sub_questions),
    tier,
    mode,
    home: researchProHome(),
    status: "running",
    trace_schema_version: 1,
    trace_path: tracePath,
    run_log_path: runLogPath,
    parent_run_id: traceField(firstObserved(traceExtra.parent_run_id, process.env.RESEARCH_PRO_PARENT_RUN_ID)),
    provider: traceField(firstObserved(traceExtra.provider, process.env.RESEARCH_PRO_PROVIDER)),
    model: traceField(firstObserved(traceExtra.model, process.env.RESEARCH_PRO_MODEL)),
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
  iteration = null,
  scope_key = null,
  contract_hash = null,
  provider = null,
  model = null,
  request_id = null,
  tool_call_id = null,
  attempt = null,
  error_type = null,
  retry_count = null,
  fallback_chain = null,
  fallback_route = null,
  usage = null,
  cost_usd = null,
  start_time = null,
  end_time = null,
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
    ensureDir(path.join(dir, "raw"));

    const results = extractResults(payload);
    const records = extractRecords(payload);
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
        ? Boolean(degraded)
        : Boolean(payload?.degraded || (payload?.meta && payload.meta.gaps?.length));
    const elapsedValue =
      elapsed_ms != null
        ? elapsed_ms
        : payload?.elapsed_ms ?? payload?.meta?.tool_time_ms ?? null;
    const elapsedNumber = Number(elapsedValue);
    const elapsed = Number.isFinite(elapsedNumber) ? elapsedNumber : null;
    const evidence = uniqueEvidence([...results, ...records]);
    const result_count =
      evidence.length ||
      (Number.isFinite(Number(payload?.result_count)) ? Number(payload.result_count) : null) ||
      (Number.isFinite(Number(payload?.meta?.count)) ? Number(payload.meta.count) : 0);
    let observedError = error || payload?.error || null;
    let inferredStatus = observedError
      ? "error"
      : status && status !== "ok"
        ? status
        : deg
          ? "degraded"
          : hasEvidence(payload, results)
            ? "ok"
            : "zero";
    const urls = topUrls(evidence, topN());
    const entryTs = nowIso();
    const callProvider = firstObserved(provider, payload?.provider, process.env.RESEARCH_PRO_PROVIDER);
    const callModel = firstObserved(model, payload?.model, process.env.RESEARCH_PRO_MODEL);
    const callRequestId = firstObserved(request_id, payload?.request_id);
    const callToolCallId = firstObserved(tool_call_id, payload?.tool_call_id);
    const callAttempt = firstObserved(attempt, payload?.attempt);
    const callRetryCount = firstObserved(retry_count, payload?.retry_count);
    const callFallbackChain = normalizeTraceArray(firstObserved(fallback_chain, payload?.fallback_chain)).map((value) => traceField(value));
    const callFallbackRoute = traceField(firstObserved(fallback_route, payload?.fallback_route));
    const callErrorType = traceField(firstObserved(error_type, payload?.error_type, classifyError(observedError)));
    const callUsage = sanitizeTraceValue(firstObserved(usage, payload?.usage, payload?.provider_usage));
    const callCost = firstObserved(cost_usd, payload?.cost_usd, payload?.provider_cost);
    const callStart = firstObserved(start_time, payload?.start_time, payload?.started_at);
    const callEnd = firstObserved(end_time, payload?.end_time, payload?.ended_at, entryTs);

    let raw_path = null;
    if (mode === "full" || force_raw) {
      try {
        const rawText = boundedRawJson(payload, maxRawBytes());
        raw_path = path.join("raw", `${call_id}.json`);
        fs.writeFileSync(path.join(dir, raw_path), rawText, { mode: 0o600 });
      } catch (e) {
        raw_path = null;
        observedError = observedError || `raw_write_failed:${e.message}`;
        inferredStatus = "error";
      }
    }

    const entry = {
      ts: entryTs,
      run_id,
      call_id,
      source: traceField(source),
      round: traceField(round),
      iteration: traceField(iteration),
      sub_q: traceField(sub_q),
      query: traceField(q),
      hint: traceField(h),
      requested_tool: traceField(reqTool),
      actual_tool: traceField(actualTool),
      degraded: deg,
      elapsed_ms: elapsed,
      duration_ms: elapsed,
      result_count,
      status: traceField(inferredStatus),
      error: observedError ? redactSecrets(String(observedError)).slice(0, 500) : null,
      error_type: callErrorType,
      contributed: traceField(contributed),
      urls_top: urls,
      raw_path,
      mode,
      scope_key: traceField(scope_key),
      contract_hash: traceField(contract_hash),
      provider: traceField(callProvider),
      model: traceField(callModel),
      request_id: traceField(callRequestId),
      tool_call_id: traceField(callToolCallId),
      attempt: traceField(callAttempt),
      retry_count: traceField(callRetryCount),
      fallback_chain: callFallbackChain,
      fallback_route: callFallbackRoute,
      usage: callUsage,
      cost_usd: traceField(callCost),
      start_time: traceField(callStart),
      end_time: traceField(callEnd),
      trace_coverage: "recorded",
    };
    appendJsonl(path.join(dir, "calls.jsonl"), entry);

    // best-effort update run.json counters
    try {
      const runPath = path.join(dir, "run.json");
      updateRunMeta(runPath, (meta) => {
        meta.calls = (meta.calls || 0) + 1;
        meta.ts_last_call = entry.ts;
        meta.tools = meta.tools || {};
        const tkey = traceField(actualTool) || "unknown";
        meta.tools[tkey] = (meta.tools[tkey] || 0) + 1;
      });
    } catch {
      /* ignore */
    }

    return { ok: true, call_id, run_id, raw_path };
  } catch (e) {
    return { ok: false, error: redactSecrets(String(e?.message || e)) };
  }
}

function readTraceEntries(traceFile) {
  const result = {
    readable: false,
    entries: [],
    invalid_lines: 0,
    error: null,
  };
  let stat;
  try {
    stat = fs.statSync(traceFile);
  } catch (error) {
    if (error?.code !== "ENOENT") result.error = redactSecrets(String(error?.message || error)).slice(0, 500);
    return result;
  }
  if (!stat.isFile()) {
    result.error = "trace_not_file";
    return result;
  }
  let text;
  try {
    text = fs.readFileSync(traceFile, "utf8");
  } catch (error) {
    result.error = redactSecrets(String(error?.message || error)).slice(0, 500);
    return result;
  }
  result.readable = true;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === "object") result.entries.push(entry);
      else result.invalid_lines += 1;
    } catch {
      result.invalid_lines += 1;
    }
  }
  return result;
}

function isRegularFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
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
  status = null,
  termination_reason = null,
  trace_coverage = null,
  artifact_paths = [],
  source_manifest_path = null,
  trace_path = null,
  parent_run_id = null,
  provider = null,
  model = null,
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
    const ts_end = nowIso();
    if (summary != null) meta.summary = redactSecrets(String(summary)).slice(0, 5000);
    if (confidence != null) meta.confidence = traceField(confidence);
    if (tools_used != null) meta.tools_used = sanitizeTraceValue(tools_used);
    if (tools_contributed != null) meta.tools_contributed = sanitizeTraceValue(tools_contributed);

    const artifacts = new Set(
      (Array.isArray(artifact_paths) ? artifact_paths : [artifact_paths])
        .filter(Boolean)
        .map((value) => redactSecrets(String(value))),
    );
    const missingArtifacts = [];

    if (report_text != null) {
      fs.writeFileSync(path.join(dir, "report.md"), redactSecrets(String(report_text)), { mode: 0o600 });
      meta.report_path = path.join(dir, "report.md");
      artifacts.add(meta.report_path);
    } else if (report_path && fs.existsSync(report_path)) {
      try {
        const reportContent = fs.readFileSync(report_path, "utf8");
        fs.writeFileSync(path.join(dir, "report.md"), redactSecrets(reportContent), { mode: 0o600 });
        meta.report_path = path.join(dir, "report.md");
        artifacts.add(meta.report_path);
      } catch {
        meta.report_path = redactSecrets(String(report_path));
        missingArtifacts.push(redactSecrets(String(report_path)));
      }
    } else if (report_path) {
      meta.report_path = redactSecrets(String(report_path));
      missingArtifacts.push(redactSecrets(String(report_path)));
    }
    if (source_manifest_path) {
      meta.source_manifest_path = redactSecrets(String(source_manifest_path));
      if (!/^https?:\/\//i.test(String(source_manifest_path)) && !isRegularFile(String(source_manifest_path))) {
        missingArtifacts.push(redactSecrets(String(source_manifest_path)));
      }
    }
    for (const artifact of artifacts) {
      if (!/^https?:\/\//i.test(artifact) && !isRegularFile(artifact)) missingArtifacts.push(artifact);
    }

    // call stats: only a readable regular file with valid JSONL entries can support coverage.
    const selectedTracePath = trace_path || meta.trace_path || path.join(dir, "calls.jsonl");
    trace_path = selectedTracePath;
    const traceState = readTraceEntries(selectedTracePath);
    meta.calls = traceState.entries.length;
    const tools = {};
    let degraded = 0;
    for (const entry of traceState.entries) {
      const t = typeof entry.actual_tool === "string"
        ? redactSecrets(entry.actual_tool).slice(0, 2000)
        : "unknown";
      tools[t] = (tools[t] || 0) + 1;
      if (entry.degraded) degraded += 1;
    }
    meta.tools = tools;
    meta.degraded_calls = degraded;
    meta.trace_invalid_lines = traceState.invalid_lines;
    if (traceState.error) meta.trace_read_error = traceState.error;

    const requestedCoverage = ["full", "partial", "none", "metadata-only"].includes(String(trace_coverage || ""))
      ? String(trace_coverage)
      : null;
    const hasUsableTrace = traceState.readable && traceState.entries.length > 0;
    const hasCompleteTrace = hasUsableTrace && traceState.invalid_lines === 0;
    const coverage = requestedCoverage === "full"
      ? (hasCompleteTrace ? "full" : hasUsableTrace ? "partial" : "none")
      : requestedCoverage === "partial"
        ? (hasUsableTrace ? "partial" : "none")
        : requestedCoverage === "metadata-only"
          ? (traceState.readable ? "metadata-only" : "none")
          : (hasUsableTrace ? "partial" : "none");
    const allowedStatuses = new Set([
      "running", "partial", "truncated", "failed", "cancelled", "completed_with_gaps", "completed",
    ]);
    const normalizedStatus = String(status || "completed").toLowerCase();
    const requestedStatus = normalizedStatus === "done"
      ? "completed"
      : allowedStatuses.has(normalizedStatus)
        ? normalizedStatus
        : "failed";
    let finalStatus = requestedStatus;
    if (finalStatus === "completed" && (coverage !== "full" || missingArtifacts.length > 0)) {
      finalStatus = "completed_with_gaps";
    }
    const reserved = new Set([
      "run_id", "ts_end", "status", "trace_coverage", "termination_reason", "trace_path", "run_log_path",
      "artifact_paths", "missing_artifacts", "artifact_status", "source_manifest_path", "report_path",
    ]);
    const safeExtra = extra && typeof extra === "object"
      ? Object.fromEntries(Object.entries(extra).filter(([key]) => !reserved.has(key)))
      : {};
    const traceExtra = sanitizeTraceValue(safeExtra) || {};
    const terminalReason = termination_reason || finalStatus;
    const safeTerminalReason = finalStatus === "completed_with_gaps" && /^(?:completed|done)$/i.test(String(terminalReason))
      ? finalStatus
      : traceField(terminalReason);
    Object.assign(meta, traceExtra, {
      ts_end,
      status: finalStatus,
      trace_coverage: coverage,
      termination_reason: safeTerminalReason,
      trace_path: redactSecrets(String(trace_path || meta.trace_path || path.join(dir, "calls.jsonl"))),
      run_log_path: redactSecrets(path.join(researchProHome(), "run-log.jsonl")),
      artifact_paths: [...artifacts],
      missing_artifacts: [...new Set(missingArtifacts)],
      artifact_status: missingArtifacts.length ? "incomplete" : "complete",
      parent_run_id: traceField(firstObserved(parent_run_id, meta.parent_run_id, process.env.RESEARCH_PRO_PARENT_RUN_ID)),
      provider: traceField(firstObserved(provider, meta.provider, process.env.RESEARCH_PRO_PROVIDER)),
      model: traceField(firstObserved(model, meta.model, process.env.RESEARCH_PRO_MODEL)),
    });

    // also append compact row to run-log.jsonl (Phase 5 companion)
    let logStatus = "written";
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
        status: meta.status,
        termination_reason: meta.termination_reason,
        trace_coverage: meta.trace_coverage,
        trace_path: meta.trace_path,
        source_manifest_path: meta.source_manifest_path || null,
        artifact_paths: meta.artifact_paths,
        missing_artifacts: meta.missing_artifacts,
        provider: meta.provider,
        model: meta.model,
      });
    } catch (error) {
      logStatus = "failed";
      meta.run_log_error = redactSecrets(String(error?.message || error)).slice(0, 500);
    }
    if (logStatus === "failed" && meta.status === "completed") {
      meta.status = "completed_with_gaps";
      meta.termination_reason = "run_log_write_failed";
    }
    meta.run_log_status = logStatus;

    if (fs.existsSync(runPath)) {
      updateRunMeta(runPath, (current) => Object.assign(current, meta));
    } else {
      atomicWriteJson(runPath, meta);
    }

    return { ok: logStatus === "written", run_id, run_dir: dir, meta, log_status: logStatus };
  } catch (e) {
    return { ok: false, error: redactSecrets(String(e?.message || e)) };
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
