import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

export const CACHE_SCHEMA_VERSION = 1;
export const CACHE_KEY_VERSION = 1;

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "mc_cid", "mc_eid",
]);
const SENSITIVE_KEY = /(?:^|_)(?:authorization|cookie(?:s)?|set_cookie(?:s)?|password|passwd|secret(?:s)?|client_secret(?:s)?|credential(?:s)?|api_key(?:s)?|apikey(?:s)?|x_api_key(?:s)?|api_token(?:s)?|access_token(?:s)?|refresh_token(?:s)?|bearer_token(?:s)?|token(?:s)?|sig(?:nature)?|login|session(?:_?ids?)?|private_key(?:s)?|raw_headers?)(?:_|$)/i;
const SENSITIVE_AUTH_KEY = /(?:^|_)auth(?:_|$)/i;
const SENSITIVE_COMPACT_STEM = /authorization|authentication|cookie|password|passwd|secret|credential|apikey|accesstoken|refreshtoken|authtoken|bearertoken|privatekey|session|rawheader/i;
const USAGE_METRIC_KEY = /^(?:token_count|prompt_tokens|completion_tokens|total_tokens|input_tokens|output_tokens|cached_tokens|reasoning_tokens|cache_read_tokens|cache_write_tokens|tokens_used|token_usage|input_token_count|output_token_count|cached_token_count|reasoning_token_count|cache_read_token_count|cache_write_token_count|prompt_token_count|completion_token_count|total_token_count|audio_tokens|image_tokens|video_tokens|accepted_prediction_tokens|rejected_prediction_tokens|cache_creation_input_tokens|cache_read_input_tokens)$/i;
const USAGE_CONTAINER_KEY = /^(?:usage|provider_usage|usage_details|prompt_tokens_details|completion_tokens_details|input_tokens_details|output_tokens_details|cache_creation_details|cache_read_details|cache_write_details)$/i;
const SECRET_VALUE = /(?:Bearer\s+|api[_-]?key\s*[:=]\s*|(?:set[-_]?cookie|cookie|secret|password|client[-_]?secret)\s*[:=]\s*)[^\s,;]+|(?:sk|tvly|xai)-[A-Za-z0-9._-]{8,}/gi;

export function researchProHome() {
  return process.env.RESEARCH_PRO_HOME || path.join(os.homedir(), ".config", "research-pro");
}

export function cachePath() {
  return process.env.RESEARCH_PRO_CACHE_FILE || path.join(researchProHome(), "search-cache.jsonl");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeQuery(value) {
  return normalizeText(value);
}

function resolveHints(options = {}, data = {}) {
  const explicit = Array.isArray(options.hints) ? options.hints : [];
  if (explicit.length) return explicit;
  const payloadHints = Array.isArray(data.hints) ? data.hints : [];
  if (payloadHints.length) return payloadHints;
  const fallback = options.hint || options.requested_hint || data.hint || data.requested_hint || "";
  return fallback ? [fallback] : [];
}

export function canonicalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      if (TRACKING_PARAMS.has(normalizedKey) || isSensitiveKey(key)) {
        url.searchParams.delete(key);
      }
    }
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return redactString(raw.split("#", 1)[0]);
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function inferFreshness(hint = "", intention = "", explicit = "") {
  if (explicit) return normalizeText(explicit);
  const value = `${hint} ${intention}`.toLowerCase();
  if (["realtime", "real-time", "current", "latest", "price", "policy", "quota", "social", "community"].some((word) => value.includes(word))) return "dynamic";
  if (value.includes("histor")) return "historical";
  if (hint === "scrape") return "page";
  return "stable";
}

export function freshnessTtlSeconds(freshnessClass) {
  const envName = `RESEARCH_PRO_CACHE_TTL_${normalizeText(freshnessClass).toUpperCase()}_SECONDS`;
  const configured = Number(process.env[envName]);
  if (Number.isFinite(configured) && configured >= 0) return Math.floor(configured);
  return ({ dynamic: 6 * 3600, historical: 365 * 86400, page: 7 * 86400, stable: 30 * 86400 })[normalizeText(freshnessClass)] ?? 30 * 86400;
}

export function cacheKey({
  query = "", hints = [], scope_key = "", contract_hash = "", intention = "", locale = "", region = "",
  jurisdiction = "", domain = "", source_type = "", record_kind = "search", limit = 8,
  as_of = "", freshness_class = "", requested_tool = "",
} = {}) {
  const fields = {
    key_version: CACHE_KEY_VERSION,
    query: normalizeQuery(query),
    hints: [...new Set((hints || []).map(normalizeText).filter(Boolean))].sort(),
    scope_key: normalizeText(scope_key),
    contract_hash: normalizeText(contract_hash),
    intention: normalizeText(intention),
    locale: normalizeText(locale),
    region: normalizeText(region),
    jurisdiction: normalizeText(jurisdiction),
    domain: normalizeText(domain),
    source_type: normalizeText(source_type),
    record_kind: normalizeText(record_kind) || "search",
    limit: Number(limit || 0),
    as_of: normalizeText(as_of),
    freshness_class: normalizeText(freshness_class),
    requested_tool: normalizeText(requested_tool),
  };
  return crypto.createHash("sha256").update(`research-pro-search-cache-v${CACHE_KEY_VERSION}:${stableStringify(fields)}`).digest("hex");
}

function redactString(value) {
  return typeof value === "string"
    ? value
      .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s?#]*@/g, "$1")
      .replace(/((?:^|[\s?&])(?:authorization|auth|cookie|set[-_]?cookie|password|secret|credential|client[-_]?secret|x[-_]?api[-_]?key|apikey|api[_-]?key|access[_-]?token|refresh[_-]?token|token|sig|signature|session|private[_-]?key)=)[^&#\s]+/gi, "$1[REDACTED]")
      .replace(SECRET_VALUE, "[REDACTED]")
    : value;
}

function safeField(value, max = 2000) {
  return redactString(String(value ?? "")).slice(0, max);
}

function isSensitiveKey(key) {
  const normalized = String(key).replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/-/g, "_").toLowerCase();
  if (USAGE_METRIC_KEY.test(normalized) || USAGE_CONTAINER_KEY.test(normalized)) return false;
  return SENSITIVE_KEY.test(normalized)
    || SENSITIVE_AUTH_KEY.test(normalized)
    || SENSITIVE_COMPACT_STEM.test(normalized.replace(/_/g, ""));
}

const CACHE_TRANSIENT_KEYS = new Set(["raw", "raw_text", "headers", "request", "response_headers"]);
const CACHE_ENTRY_ARRAY_KEYS = new Set(["results", "merged_results", "records", "merged_records"]);

function stripCacheTransientFields(value) {
  if (Array.isArray(value)) return value.map(stripCacheTransientFields);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (CACHE_TRANSIENT_KEYS.has(key.toLowerCase())) continue;
      out[key] = stripCacheTransientFields(child);
    }
    return out;
  }
  return value;
}

function sanitizeCacheRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    let cleaned;
    if (key === "payload") {
      cleaned = sanitize(child);
    } else if (CACHE_ENTRY_ARRAY_KEYS.has(key) && Array.isArray(child)) {
      cleaned = child.slice(0, 20).map((item) => sanitize(item)).filter((item) => item !== null);
    } else if (key === "batches") {
      cleaned = sanitize(child);
    } else {
      cleaned = sanitize(child, key);
    }
    if (cleaned !== null) out[key] = cleaned;
  }
  return stripCacheTransientFields(out);
}

function sanitize(value, key = "", depth = 0) {
  if (depth > 8 || isSensitiveKey(key)) return null;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, key, depth + 1)).filter((item) => item !== null);
  if (value && typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (isSensitiveKey(childKey)) continue;
      const cleaned = sanitize(childValue, childKey, depth + 1);
      if (cleaned !== null) out[childKey] = cleaned;
    }
    return out;
  }
  if (typeof value === "string") {
    let max = 2000;
    const lower = key.toLowerCase();
    if (["content", "body", "markdown", "text"].includes(lower)) max = 12000;
    if (["snippet", "description", "excerpt"].includes(lower)) max = 1200;
    if (["url", "link", "href"].includes(lower)) return canonicalUrl(value).slice(0, max);
    return redactString(value).slice(0, max);
  }
  return value;
}

function extractResults(payload) {
  if (!payload || typeof payload !== "object") return [];
  const values = [];
  if (Array.isArray(payload.results)) values.push(...payload.results);
  if (Array.isArray(payload.merged_results)) values.push(...payload.merged_results);
  if (Array.isArray(payload.batches)) {
    for (const batch of payload.batches) if (Array.isArray(batch?.results)) values.push(...batch.results);
  }
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const url = canonicalUrl(value.url || value.link || value.href);
    const title = String(value.title || "").slice(0, 1000);
    const snippet = String(value.snippet || value.content || value.description || "").slice(0, 1200);
    const fingerprint = crypto.createHash("sha256").update(stableStringify({ url, title, snippet })).digest("hex");
    const dedupeKey = url || fingerprint;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const cleaned = stripCacheTransientFields(sanitize(value) || {});
    if (url) cleaned.url = url;
    cleaned.fingerprint = fingerprint;
    out.push(cleaned);
    if (out.length >= 20) break;
  }
  return out;
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
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const cleaned = stripCacheTransientFields(sanitize(value));
    if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) continue;
    const fingerprint = stableStringify(cleaned);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(cleaned);
    if (out.length >= 20) break;
  }
  return out;
}

function evidenceCount(results, records) {
  const seen = new Set();
  let count = 0;
  for (const value of [...results, ...records]) {
    if (!value || typeof value !== "object") continue;
    const key = canonicalUrl(value.url || value.link || value.href) || value.id || stableStringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  return count;
}

function payloadForCache(payload) {
  const cleaned = stripCacheTransientFields(sanitize(payload || {}) || {});
  const results = extractResults(payload || {});
  if (results.length) {
    cleaned.results = results;
    if (Object.prototype.hasOwnProperty.call(cleaned, "merged_results")) cleaned.merged_results = results;
  }
  const records = extractRecords(payload || {});
  if (records.length) {
    cleaned.records = records;
    if (Object.prototype.hasOwnProperty.call(cleaned, "merged_records")) cleaned.merged_records = records;
  }
  return cleaned;
}

function statusFor(payload, explicit, degraded, error, results, records = []) {
  if (["ok", "zero", "degraded", "error"].includes(explicit)) return explicit;
  if (error || payload?.error) return "error";
  if (degraded || payload?.degraded) return "degraded";
  return results.length || records.length || payload?.content || payload?.body_read ? "ok" : "zero";
}

function nowIso() {
  return new Date().toISOString();
}

export function makeCacheRecord(payload = {}, options = {}) {
  const data = payload || {};
  const hints = resolveHints(options, data);
  const hint = options.hint || data.hint || data.requested_hint || hints[0] || "";
  const query = options.query || data.query || data.input || "";
  const intention = options.intention || data.intention || hint;
  const freshnessClass = inferFreshness(hints.join(" "), intention, options.freshness || "");
  const recordKind = normalizeText(options.record_kind || data.record_kind || (hint === "scrape" ? "extract" : "search")) || "search";
  const requestedTool = options.requested_tool || data.requested_tool || "";
  const actualTool = options.actual_tool || data.tool || "";
  const degraded = options.degraded == null ? Boolean(data.degraded) : Boolean(options.degraded);
  const error = options.error || data.error || null;
  const results = extractResults(data);
  const records = extractRecords(data);
  const status = statusFor(data, options.status, degraded, error, results, records);
  const resultCount = evidenceCount(results, records) || (data.content || data.body_read ? 1 : 0);
  const safeQuery = safeField(query);
  const safeIntention = safeField(intention);
  const safeHint = safeField(hint);
  const safeHints = [...new Set(hints.filter(Boolean).map((value) => safeField(value)))].sort();
  const safeRequestedTool = safeField(requestedTool);
  const safeActualTool = safeField(actualTool);
  const keyOptions = {
    query: safeQuery, hints: safeHints, scope_key: safeField(options.scope_key), contract_hash: safeField(options.contract_hash), intention: safeIntention,
    locale: options.locale || "", region: options.region || "", jurisdiction: options.jurisdiction || "",
    domain: options.domain || "", source_type: options.source_type || "", record_kind: recordKind,
    limit: options.limit || 8, as_of: options.as_of || "", freshness_class: freshnessClass, requested_tool: requestedTool,
  };
  return {
    schema_version: CACHE_SCHEMA_VERSION,
    key_version: CACHE_KEY_VERSION,
    record_kind: recordKind,
    cache_key: cacheKey(keyOptions),
    scope_key: safeField(options.scope_key),
    contract_hash: safeField(options.contract_hash),
    intention: safeIntention,
    hint: safeHint,
    hints: safeHints,
    query: safeQuery,
    normalized_query: safeField(normalizeQuery(query)),
    locale: safeField(options.locale),
    region: safeField(options.region),
    jurisdiction: safeField(options.jurisdiction),
    domain: safeField(options.domain),
    source_type: safeField(options.source_type),
    requested_tool: safeRequestedTool,
    actual_tool: safeActualTool,
    retrieved_at: options.retrieved_at || data.retrieved_at || data.fetched_at || nowIso(),
    as_of: String(options.as_of || ""),
    freshness_class: freshnessClass,
    freshness_ttl_seconds: freshnessTtlSeconds(freshnessClass),
    status,
    degraded,
    result_count: resultCount,
    results,
    records,
    payload: payloadForCache(data),
    error: error ? redactString(String(error)).slice(0, 500) : null,
    run_id: safeField(options.run_id),
    source: safeField(options.source || "host-native"),
  };
}

function sleepMs(ms) {
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, ms);
}

function withLock(file, callback) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lockFile = `${file}.lock`;
  let fd = null;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      fd = fs.openSync(lockFile, "wx", 0o600);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lockFile).mtimeMs > 60000) fs.unlinkSync(lockFile);
      } catch { /* another writer owns/removes it */ }
      sleepMs(10);
    }
  }
  if (fd === null) throw new Error("cache_lock_timeout");
  try {
    return callback();
  } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }
}

export function appendCacheRecord(record, { file = cachePath() } = {}) {
  try {
    const line = `${JSON.stringify(record)}\n`;
    const result = withLock(file, () => {
      fs.appendFileSync(file, line, { encoding: "utf8", mode: 0o600 });
      try { fs.chmodSync(file, 0o600); } catch { /* ignore */ }
      return { ok: true, path: file, cache_key: record.cache_key };
    });
    return result;
  } catch (error) {
    return { ok: false, path: file, error: redactString(String(error?.message || error)).slice(0, 500) };
  }
}

function readRecords(file = cachePath()) {
  const records = [];
  let invalid_lines = 0;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    if (error?.code === "ENOENT") return { records: [], invalid_lines: 0, read_error: null };
    return { records: [], invalid_lines, read_error: redactString(String(error?.message || error)).slice(0, 500) };
  }
  if (!stat.isFile()) return { records: [], invalid_lines, read_error: "cache_not_file" };
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line);
        const cleaned = sanitizeCacheRecord(value);
        if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)) records.push(cleaned);
        else invalid_lines += 1;
      } catch { invalid_lines += 1; }
    }
  } catch (error) {
    return { records: [], invalid_lines, read_error: redactString(String(error?.message || error)).slice(0, 500) };
  }
  return { records, invalid_lines, read_error: null };
}

function parseTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : null;
}

function ageSeconds(record) {
  const ts = parseTime(record.retrieved_at);
  return ts === null ? null : Math.max(0, (Date.now() - ts) / 1000);
}

function isStale(record) {
  const age = ageSeconds(record);
  const ttl = Number(record.freshness_ttl_seconds);
  return age === null || !Number.isFinite(ttl) || age > ttl;
}

function project(record, stale) {
  const projected = { ...stripCacheTransientFields(sanitize(record.payload) || {}) };
  return {
    ...projected,
    cached: true,
    _from_cache: true,
    cache_key: record.cache_key,
    cache_age_seconds: ageSeconds(record),
    cache_retrieved_at: record.retrieved_at,
    cache_status: record.status,
    cache_stale: stale,
    cache_freshness_class: record.freshness_class,
    cache_source: record.source,
  };
}

export function lookupCache(options = {}, { file = cachePath() } = {}) {
  const hints = resolveHints(options);
  const freshnessClass = inferFreshness(hints.join(" "), options.intention || "", options.freshness || "");
  const key = cacheKey({ ...options, hints, intention: options.intention || hints[0] || "", freshness_class: freshnessClass });
  const { records, invalid_lines, read_error } = readRecords(file);
  const matches = records.filter((record) => record.cache_key === key).sort((a, b) => (parseTime(b.retrieved_at) || 0) - (parseTime(a.retrieved_at) || 0));
  const latest = matches[0];
  const result = {
    ok: !read_error,
    hit: false,
    cache_key: key,
    invalid_lines,
    stale: false,
    read_error: read_error || null,
  };
  if (read_error) return result;
  if (!latest) return result;
  const stale = isStale(latest);
  Object.assign(result, { status: latest.status, stale, record: latest });
  if (latest.status === "ok" && !latest.degraded && !stale) {
    return { ...result, hit: true, result: project(latest, false), cache_age_seconds: ageSeconds(latest) };
  }
  if (latest.status === "ok" && stale) result.stale_record = project(latest, true);
  return result;
}
