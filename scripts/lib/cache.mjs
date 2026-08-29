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
const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|login|session|credential|private[_-]?key|raw_headers?)/i;
const SECRET_VALUE = /(?:Bearer\s+|api[_-]?key\s*[:=]\s*|secret\s*[:=]\s*|password\s*[:=]\s*)[^\s,;]+|(?:sk|tvly|xai)-[A-Za-z0-9._-]{8,}/gi;

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

export function canonicalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return raw.split("#", 1)[0];
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
  return typeof value === "string" ? value.replace(SECRET_VALUE, "[REDACTED]") : value;
}

function sanitize(value, key = "", depth = 0) {
  if (depth > 8 || SENSITIVE_KEY.test(key)) return null;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, key, depth + 1)).filter((item) => item !== null);
  if (value && typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(childKey)) continue;
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
    const cleaned = sanitize(value) || {};
    if (url) cleaned.url = url;
    cleaned.fingerprint = fingerprint;
    out.push(cleaned);
    if (out.length >= 20) break;
  }
  return out;
}

function payloadForCache(payload) {
  const cleaned = sanitize(payload || {}) || {};
  for (const key of ["raw", "raw_text", "headers", "request", "response_headers"]) delete cleaned[key];
  const results = extractResults(payload || {});
  if (results.length) {
    cleaned.results = results;
    if (Object.prototype.hasOwnProperty.call(cleaned, "merged_results")) cleaned.merged_results = results;
  }
  return cleaned;
}

function statusFor(payload, explicit, degraded, error, results) {
  if (["ok", "zero", "degraded", "error"].includes(explicit)) return explicit;
  if (error || payload?.error) return "error";
  if (degraded || payload?.degraded) return "degraded";
  return results.length || payload?.content || payload?.body_read || payload?.records ? "ok" : "zero";
}

function nowIso() {
  return new Date().toISOString();
}

export function makeCacheRecord(payload = {}, options = {}) {
  const data = payload || {};
  const hints = options.hints?.length ? options.hints : (Array.isArray(data.hints) ? data.hints : []);
  const hint = options.hint || data.hint || data.requested_hint || hints[0] || "";
  const query = options.query || data.query || data.input || "";
  const intention = options.intention || data.intention || hint;
  const freshnessClass = inferFreshness(hint, intention, options.freshness || "");
  const recordKind = normalizeText(options.record_kind || data.record_kind || (hint === "scrape" ? "extract" : "search")) || "search";
  const requestedTool = options.requested_tool || data.requested_tool || "";
  const actualTool = options.actual_tool || data.tool || "";
  const degraded = options.degraded == null ? Boolean(data.degraded) : Boolean(options.degraded);
  const error = options.error || data.error || null;
  const results = extractResults(data);
  const status = statusFor(data, options.status, degraded, error, results);
  const resultCount = results.length || (data.content || data.body_read || data.records ? 1 : 0);
  const keyOptions = {
    query, hints, scope_key: options.scope_key || "", contract_hash: options.contract_hash || "", intention,
    locale: options.locale || "", region: options.region || "", jurisdiction: options.jurisdiction || "",
    domain: options.domain || "", source_type: options.source_type || "", record_kind: recordKind,
    limit: options.limit || 8, as_of: options.as_of || "", freshness_class: freshnessClass, requested_tool: requestedTool,
  };
  return {
    schema_version: CACHE_SCHEMA_VERSION,
    key_version: CACHE_KEY_VERSION,
    record_kind: recordKind,
    cache_key: cacheKey(keyOptions),
    scope_key: String(options.scope_key || ""),
    contract_hash: String(options.contract_hash || ""),
    intention: String(intention || ""),
    hint: String(hint || ""),
    hints: [...new Set(hints.filter(Boolean).map(String))].sort(),
    query: String(query).slice(0, 2000),
    normalized_query: normalizeQuery(query),
    locale: String(options.locale || ""),
    region: String(options.region || ""),
    jurisdiction: String(options.jurisdiction || ""),
    domain: String(options.domain || ""),
    source_type: String(options.source_type || ""),
    requested_tool: String(requestedTool || ""),
    actual_tool: String(actualTool || ""),
    retrieved_at: options.retrieved_at || data.retrieved_at || data.fetched_at || nowIso(),
    as_of: String(options.as_of || ""),
    freshness_class: freshnessClass,
    freshness_ttl_seconds: freshnessTtlSeconds(freshnessClass),
    status,
    degraded,
    result_count: resultCount,
    results,
    payload: payloadForCache(data),
    error: error ? redactString(String(error)).slice(0, 500) : null,
    run_id: String(options.run_id || ""),
    source: String(options.source || "host-native"),
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
    return { ok: false, path: file, error: String(error?.message || error) };
  }
}

function readRecords(file = cachePath()) {
  if (!fs.existsSync(file)) return { records: [], invalid_lines: 0 };
  const records = [];
  let invalid_lines = 0;
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line);
        if (value && typeof value === "object") records.push(value);
        else invalid_lines += 1;
      } catch { invalid_lines += 1; }
    }
  } catch { return { records: [], invalid_lines }; }
  return { records, invalid_lines };
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
  const projected = { ...(sanitize(record.payload) || {}) };
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
  const hints = options.hints || [];
  const freshnessClass = inferFreshness(hints[0] || "", options.intention || "", options.freshness || "");
  const key = cacheKey({ ...options, hints, intention: options.intention || hints[0] || "", freshness_class: freshnessClass });
  const { records, invalid_lines } = readRecords(file);
  const matches = records.filter((record) => record.cache_key === key).sort((a, b) => (parseTime(b.retrieved_at) || 0) - (parseTime(a.retrieved_at) || 0));
  const latest = matches[0];
  const result = { hit: false, cache_key: key, invalid_lines, stale: false };
  if (!latest) return result;
  const stale = isStale(latest);
  Object.assign(result, { status: latest.status, stale, record: latest });
  if (latest.status === "ok" && !latest.degraded && !stale) {
    return { ...result, hit: true, result: project(latest, false), cache_age_seconds: ageSeconds(latest) };
  }
  if (latest.status === "ok" && stale) result.stale_record = project(latest, true);
  return result;
}
