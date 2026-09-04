/**
 * source_integrity.mjs — fail-closed source identity and transport gates.
 *
 * The functions in this file are provider-neutral and side-effect free. They
 * accept untrusted result objects, preserve their original order, and return
 * structured failures instead of repairing or throwing on malformed payloads.
 */

import { createHash } from "node:crypto";
import { classifyUrl } from "./url_policy.mjs";

export const CONTENT_KINDS = Object.freeze([
  "api_json",
  "raw_text",
  "html_markdown",
  "api_transport_invalid",
  "empty",
]);

export const IDENTITY_STATUSES = Object.freeze(["verified", "failed", "unverified"]);
export const EVIDENCE_CAPABILITIES = Object.freeze([
  "none",
  "discovery_only",
  "official_discovery_only",
  "page_body",
  "preview_extracted",
  "social_lead_only",
  "evidence_grade",
]);

const SENSITIVE_QUERY_KEYS = new Set([
  "api_key", "apikey", "api-key", "access_token", "auth", "auth_token",
  "authorization", "client_secret", "cookie", "credential", "key",
  "password", "private_key", "private_token", "secret", "session", "sig",
  "signature", "token",
]);
const GITHUB_HOSTS = new Set(["github.com", "www.github.com", "api.github.com", "raw.githubusercontent.com"]);
const SECRET_ASSIGNMENT = /(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|session|token|key)\s*[=:]\s*([^\s&,;]+)/gi;
const PRIVATE_PATH = /(?:^|[\s"'`])\/(?:Users|home)\/[^\s/]+(?:\/[^\s]*)?/g;
const INTERNAL_LABELS = new Set(["internal_path", "stack", "stack_trace", "debug", "traceback"]);

function bytesOf(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  return Buffer.from(String(value ?? ""), "utf8");
}

function textOf(value) {
  return bytesOf(value).toString("utf8");
}

function failure(failure_class, message, extra = {}) {
  return { failure_class, message, ...extra };
}

function invalidTransport(reason_class, raw, message) {
  const bytes = bytesOf(raw);
  return {
    ok: false,
    content_kind: "api_transport_invalid",
    failure_class: "api_transport_invalid",
    reason_class,
    message,
    content_sha256: contentSha256(bytes),
    content_bytes: bytes.length,
    parsed: null,
  };
}

export function contentSha256(raw) {
  return createHash("sha256").update(bytesOf(raw)).digest("hex");
}

export const sha256Content = contentSha256;

/**
 * Parse a raw API response before any Markdown/text normalization. A leading
 * extractor wrapper or an invalid JSON escape is transport-invalid, not a
 * partially valid API object.
 */
export function classifyApiJson(raw) {
  const bytes = bytesOf(raw);
  const source = bytes.toString("utf8").replace(/^\uFEFF/, "");
  const trimmed = source.trim();
  if (!trimmed) return invalidTransport("empty", bytes, "empty API response");
  if (/^(?:#(?:\s|$)|URL:\s*)/i.test(trimmed)) return invalidTransport("wrapper_prefix", bytes, "extractor wrapper text precedes API JSON");
  if (/\\(?!["\\/bfnrtu])/u.test(trimmed)) return invalidTransport("junk_escape", bytes, "invalid JSON escape sequence");

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return invalidTransport("invalid_json", bytes, `invalid API JSON: ${String(error?.message || error).split("\n", 1)[0]}`);
  }
  if (parsed === null || typeof parsed !== "object") return invalidTransport("unexpected_shape", bytes, "API JSON must be an object or array");
  return {
    ok: true,
    content_kind: "api_json",
    parsed,
    content_sha256: contentSha256(bytes),
    content_bytes: bytes.length,
    failure_class: null,
  };
}

export function classifyContent(raw, requestedKind = "") {
  const kind = String(requestedKind || "").toLowerCase();
  if (kind === "api_json" || kind === "json") return classifyApiJson(raw);
  const bytes = bytesOf(raw);
  if (kind === "raw_text" || kind === "text") {
    return { ok: true, content_kind: "raw_text", content: bytes.toString("utf8"), content_sha256: contentSha256(bytes), content_bytes: bytes.length };
  }
  if (kind === "html_markdown" || kind === "html" || kind === "markdown") {
    return { ok: true, content_kind: "html_markdown", content: bytes.toString("utf8"), content_sha256: contentSha256(bytes), content_bytes: bytes.length };
  }
  const trimmed = bytes.toString("utf8").trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return classifyApiJson(bytes);
  if (!trimmed) return { ok: true, content_kind: "empty", content: "", content_sha256: contentSha256(bytes), content_bytes: bytes.length };
  return { ok: true, content_kind: "raw_text", content: bytes.toString("utf8"), content_sha256: contentSha256(bytes), content_bytes: bytes.length };
}

function parseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try { return new URL(value); } catch { return null; }
}

function normalizeRepo(owner, repo) {
  if (!owner || !repo) return null;
  const cleanOwner = String(owner).replace(/^@/, "").trim().toLowerCase();
  const cleanRepo = String(repo).replace(/\.git$/i, "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(cleanOwner) || !/^[a-z0-9][a-z0-9_.-]*$/i.test(cleanRepo)) return null;
  return `${cleanOwner}/${cleanRepo}`;
}

export function githubRepoFromUrl(value) {
  const url = parseUrl(value);
  if (!url || !GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (url.hostname.toLowerCase() === "api.github.com" && parts[0]?.toLowerCase() === "repos") return normalizeRepo(parts[1], parts[2]);
  return normalizeRepo(parts[0], parts[1]);
}

export const repoFromUrl = githubRepoFromUrl;

function reposFromText(value, { allowBare = true } = {}) {
  if (typeof value !== "string" || !value) return [];
  const found = new Set();
  const absolute = /(?:https?:\/\/)?(?:www\.)?github\.com\/([^\s/#?"'<>]+)\/([^\s/#?"'<>]+)/gi;
  for (const match of value.matchAll(absolute)) {
    const repo = normalizeRepo(match[1], match[2]);
    if (repo) found.add(repo);
  }
  const relative = /\/(?:([^\s/"'<>]+))\/(?:([^\s/"'<>]+))\/(?:tree|blob|commits|issues|pull|actions|wiki)(?:[/?#\s"'<>]|$)/gi;
  for (const match of value.matchAll(relative)) {
    const repo = normalizeRepo(match[1], match[2]);
    if (repo) found.add(repo);
  }
  const name = /\b([a-z0-9][a-z0-9_.-]{0,99})\/([a-z0-9][a-z0-9_.-]{0,99})\b/gi;
  if (allowBare) {
    const reservedOwners = new Set(["github", "tree", "blob", "commits", "assets", "local", "agents", "sign", "http", "https", "www"]);
    for (const match of value.matchAll(name)) {
      const repo = normalizeRepo(match[1], match[2]);
      const owner = String(match[1]).toLowerCase();
      if (repo && !reservedOwners.has(owner) && !owner.endsWith(".com")) found.add(repo);
    }
  }
  return [...found];
}

function expectedRepo(requestedInfo) {
  if (!requestedInfo) return null;
  if (typeof requestedInfo === "string") return githubRepoFromUrl(requestedInfo) || (requestedInfo.includes("/") ? normalizeRepo(...requestedInfo.split("/", 2)) : null);
  if (Array.isArray(requestedInfo)) return null;
  if (typeof requestedInfo !== "object") return null;
  if (requestedInfo.expected_owner && requestedInfo.expected_repo) return normalizeRepo(requestedInfo.expected_owner, requestedInfo.expected_repo);
  for (const candidate of [requestedInfo.expected_owner, requestedInfo.requested_url, requestedInfo.url, requestedInfo.html_url, requestedInfo.full_name]) {
    if (!candidate) continue;
    const fromUrl = githubRepoFromUrl(String(candidate));
    if (fromUrl) return fromUrl;
    if (String(candidate).includes("/")) {
      const [owner, repo] = String(candidate).split("/", 2);
      const normalized = normalizeRepo(owner, repo);
      if (normalized) return normalized;
    }
  }
  return null;
}

function expectedForEntry(requestedInfo, entry, index) {
  if (!requestedInfo || typeof requestedInfo !== "object" || Array.isArray(requestedInfo)) return expectedRepo(requestedInfo);
  if (requestedInfo.by_result && typeof requestedInfo.by_result === "object") {
    const key = entry?.event_id || entry?.id || String(index);
    return expectedRepo(requestedInfo.by_result[key]);
  }
  if (requestedInfo.expected_by_source_index && typeof requestedInfo.expected_by_source_index === "object") {
    return expectedRepo(requestedInfo.expected_by_source_index[String(entry?.source_index)]);
  }
  if (requestedInfo.explicit_mapping === true && Array.isArray(requestedInfo.expected_owners)) {
    return expectedRepo(requestedInfo.expected_owners[index]);
  }
  return expectedRepo(requestedInfo);
}

function identityFields(entry) {
  return [
    ["url", entry?.url ?? entry?.link ?? entry?.href],
    ["html_url", entry?.html_url],
    ["full_name", entry?.full_name],
    ["title", entry?.title],
    ["heading", entry?.heading],
    ["content", entry?.content ?? entry?.body ?? entry?.text ?? entry?.markdown],
  ];
}

export function validateResultEntry(entry, index = 0) {
  const failures = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return [failure("malformed_field", "result entry must be an object", { index, field: "result" })];
  }
  for (const [field, value] of [["url", entry.url], ["link", entry.link], ["href", entry.href], ["html_url", entry.html_url], ["full_name", entry.full_name], ["title", entry.title], ["heading", entry.heading], ["content", entry.content], ["body", entry.body], ["text", entry.text], ["markdown", entry.markdown]]) {
    if (value !== undefined && value !== null && typeof value !== "string") failures.push(failure("malformed_field", `${field} must be a string`, { index, field, expected: "string", got: typeof value }));
  }
  return failures;
}

export function verifyEntryIdentity(entry, expected = null, index = 0) {
  const malformed = validateResultEntry(entry, index);
  if (malformed.length) return { identity_status: "unverified", identity_failures: malformed, evidence_eligible: false, observed_repositories: [] };
  const byField = [];
  for (const [field, value] of identityFields(entry)) {
    let repos = [];
    if (typeof value === "string" && value) {
      if (field === "url" || field === "html_url") {
        const repo = githubRepoFromUrl(value);
        if (repo) repos = [repo];
      } else if (field === "full_name") {
        const [owner, repo] = value.split("/", 2);
        const normalized = normalizeRepo(owner, repo);
        if (normalized) repos = [normalized];
      } else {
        repos = reposFromText(value, { allowBare: field === "title" || field === "heading" });
      }
    }
    if (repos.length) byField.push({ field, repos });
  }
  const observed = [...new Set(byField.flatMap((item) => item.repos))];
  const expectedRepoValue = expectedRepo(expected);
  const failures = [];
  if (!observed.length) failures.push(failure("identity_unverified", "no repository identity signal found", { index, field: "identity", expected: expectedRepoValue, observed: [] }));
  if (observed.length > 1) failures.push(failure("identity_mismatch", "identity signals disagree", { index, field: "identity", expected: expectedRepoValue, observed }));
  if (expectedRepoValue && (!observed.includes(expectedRepoValue))) failures.push(failure("identity_mismatch", "returned identity does not match requested repository", { index, field: "identity", expected: expectedRepoValue, observed }));
  const signalFields = new Set(byField.filter((item) => item.repos.length).map((item) => item.field));
  if (observed.length === 1 && signalFields.size < 2 && !expectedRepoValue) failures.push(failure("identity_unverified", "only one unbound identity signal found", { index, field: "identity", observed }));
  const failed = failures.some((item) => item.failure_class === "identity_mismatch");
  const unverified = failures.some((item) => item.failure_class === "identity_unverified");
  return {
    identity_status: failed ? "failed" : unverified ? "unverified" : "verified",
    identity_failures: failures,
    evidence_eligible: !failed && !unverified,
    observed_repositories: observed,
    identity_signals: byField,
  };
}

export function verifyBatchIdentity(payloadOrEntries, requestedInfo = null) {
  const entries = Array.isArray(payloadOrEntries) ? payloadOrEntries : payloadOrEntries?.results;
  if (!Array.isArray(entries)) {
    const item = failure("malformed_field", "payload.results must be an array", { field: "results", expected: "array", got: typeof payloadOrEntries?.results });
    return { identity_status: "unverified", identity_failures: [item], evidence_eligible: false, results: [] };
  }
  const results = entries.map((entry, index) => verifyEntryIdentity(entry, expectedForEntry(requestedInfo, entry, index), index));
  const failures = results.flatMap((item) => item.identity_failures);
  const identity_status = results.some((item) => item.identity_status === "failed") ? "failed" : results.some((item) => item.identity_status === "unverified") ? "unverified" : "verified";
  return {
    identity_status,
    identity_failures: failures,
    evidence_eligible: identity_status === "verified" && results.length > 0,
    result_count: results.length,
    verified_count: results.filter((item) => item.identity_status === "verified").length,
    failed_count: results.filter((item) => item.identity_status === "failed").length,
    unverified_count: results.filter((item) => item.identity_status === "unverified").length,
    results,
  };
}

export const verifyBatch = verifyBatchIdentity;
export const checkBatchIdentity = verifyBatchIdentity;

export function classifyFinalUrl(value) {
  const url = parseUrl(value);
  if (!url) return { status: "malformed", final_url_status: "rejected", reasons: ["malformed"], sanitized_url: null };
  const scheme = url.protocol.toLowerCase();
  const reasons = [];
  if (scheme !== "http:" && scheme !== "https:") reasons.push("unsafe_scheme");
  if (url.username || url.password) reasons.push("credential_present");
  const sensitiveKeys = [...url.searchParams.keys()].filter((key) => SENSITIVE_QUERY_KEYS.has(key.toLowerCase()));
  if (sensitiveKeys.length) reasons.push("sensitive_query");
  let policyStatus;
  try {
    policyStatus = classifyUrl(value).status;
  } catch {
    policyStatus = "malformed";
    reasons.push("malformed");
  }
  const hostStatus = policyStatus === "loopback" || policyStatus === "private" ? policyStatus : null;
  if (hostStatus) reasons.push(hostStatus);
  const cleanUrl = new URL(url.toString());
  cleanUrl.username = "";
  cleanUrl.password = "";
  for (const key of sensitiveKeys) cleanUrl.searchParams.delete(key);
  const rejected = reasons.length > 0;
  const sanitized_url = scheme === "http:" || scheme === "https:" ? (hostStatus || policyStatus === "malformed" ? null : cleanUrl.toString()) : null;
  return { status: rejected ? reasons[0] : "clean", final_url_status: rejected ? "rejected" : "ok", reasons, sanitized_url };
}

export const validateFinalUrl = classifyFinalUrl;
export const safeFinalUrl = classifyFinalUrl;
export const finalUrlStatus = classifyFinalUrl;

export function sanitizeFinalUrl(value) {
  return classifyFinalUrl(value).sanitized_url;
}

export function validateFollowupProvenance(record, options = {}) {
  const value = record && typeof record === "object" ? record : {};
  const capability = String(options.evidence_capability || value.evidence_capability || "discovery_only");
  // Only an explicitly evidence-grade follow-up (or an explicit caller flag)
  // needs discovery lineage. A normal page-body receipt can be a standalone
  // acquisition and must not be rejected merely because it has no parent.
  const evidenceGrade = options.evidence_grade === true || capability === "evidence_grade";
  const errors = [];
  if (evidenceGrade && !value.parent_event_id && !value.discovery_evidence_id) errors.push(failure("unbound_followup", "evidence-grade follow-up requires discovery lineage", { field: "parent_event_id", required: ["parent_event_id", "discovery_evidence_id"] }));
  if (options.official === true && !value.authority_registry_id) errors.push(failure("unknown_authority", "official evidence requires authority_registry_id", { field: "authority_registry_id" }));
  return {
    ok: errors.length === 0,
    status: errors.length ? (options.downgrade === true ? "downgraded" : "rejected") : "bound",
    evidence_capability: errors.length && options.downgrade === true ? "discovery_only" : capability,
    evidence_capability_original: capability,
    errors,
  };
}

export const validateProvenance = validateFollowupProvenance;

export function bindFollowup(record, lineage = {}) {
  const bound = { ...(record && typeof record === "object" ? record : {}) };
  if (lineage.parent_event_id !== undefined) bound.parent_event_id = lineage.parent_event_id;
  if (lineage.discovery_evidence_id !== undefined) bound.discovery_evidence_id = lineage.discovery_evidence_id;
  if (lineage.authority_registry_id !== undefined) bound.authority_registry_id = lineage.authority_registry_id;
  const decision = validateFollowupProvenance(bound, lineage);
  return { ...decision, record: bound };
}

const IDENTITY_CACHE_FIELDS = [
  "identity_status", "identity_failures", "content_kind", "content_sha256", "requested_url", "returned_url", "evidence_capability", "final_url_status", "parent_event_id", "discovery_evidence_id", "authority_registry_id",
];

export function projectIdentityToCache(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const payload = source.payload && typeof source.payload === "object" ? source.payload : {};
  const projected = {};
  for (const field of IDENTITY_CACHE_FIELDS) {
    if (source[field] !== undefined) projected[field] = source[field];
    else if (payload[field] !== undefined) projected[field] = payload[field];
  }
  return projected;
}

export const cacheProjection = projectIdentityToCache;
export const preserveIdentityInCache = projectIdentityToCache;

export function compareCacheIdentity(cacheEntry, sourceEntry) {
  const cached = projectIdentityToCache(cacheEntry);
  const source = projectIdentityToCache(sourceEntry);
  const missing = [];
  const differing = [];
  for (const field of IDENTITY_CACHE_FIELDS) {
    if (source[field] !== undefined && cached[field] === undefined) missing.push(field);
    else if (source[field] !== undefined && JSON.stringify(cached[field]) !== JSON.stringify(source[field])) differing.push(field);
  }
  return { ok: missing.length === 0 && differing.length === 0, missing, differing, cached, source };
}

export function retainRawPayload(raw, options = {}) {
  const bytes = bytesOf(raw);
  const maxBytes = Number.isFinite(Number(options.maxBytes)) && Number(options.maxBytes) > 0 ? Math.floor(Number(options.maxBytes)) : 1024 * 1024;
  if (bytes.length <= maxBytes) {
    return { ok: true, truncated: false, original_bytes: bytes.length, stored_bytes: bytes.length, content: bytes.toString("utf8"), envelope: null };
  }
  let prefixBytes = Math.max(0, maxBytes - 160);
  let content = "";
  let envelope;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    content = bytes.subarray(0, prefixBytes).toString("utf8");
    envelope = { truncated: true, original_bytes: bytes.length, stored_bytes: 0, content_prefix: content };
    const encoded = JSON.stringify(envelope);
    const stored = Buffer.byteLength(encoded, "utf8");
    envelope.stored_bytes = stored;
    if (stored <= maxBytes || prefixBytes === 0) break;
    prefixBytes = Math.max(0, prefixBytes - Math.ceil((stored - maxBytes) * 1.2));
  }
  const encoded = JSON.stringify(envelope);
  return { ok: true, truncated: true, original_bytes: bytes.length, stored_bytes: Buffer.byteLength(encoded, "utf8"), content: encoded, envelope };
}

export const truncateRawPayload = retainRawPayload;
export const truncateRaw = retainRawPayload;

function redactString(value) {
  return String(value)
    .replace(SECRET_ASSIGNMENT, (_match, key) => `${key}=[[REDACTED]]`)
    .replace(PRIVATE_PATH, "[[REDACTED_PATH]]");
}

export function redactPublicText(value) {
  return typeof value === "string" ? redactString(value) : value;
}

export const redactText = redactPublicText;

export function sanitizePublicOutput(value, options = {}, depth = 0) {
  if (depth > 20) return "[[REDACTED_DEPTH]]";
  if (typeof value === "string") return redactString(value).slice(0, options.maxStringLength || 12000);
  if (Array.isArray(value)) return value.slice(0, options.maxArrayLength || 100).map((item) => sanitizePublicOutput(item, options, depth + 1));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (INTERNAL_LABELS.has(key.toLowerCase()) && options.includeInternal !== true) continue;
      output[key] = sanitizePublicOutput(child, options, depth + 1);
    }
    return output;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (["function", "symbol", "bigint", "undefined"].includes(typeof value)) return null;
  return value;
}

export const publicOutput = sanitizePublicOutput;
export const renderPublicOutput = sanitizePublicOutput;

export function validatePublicOutput(value) {
  const serialized = JSON.stringify(value);
  const violations = [];
  const withoutPlaceholders = String(serialized || "")
    .replace(/(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|session|token|key)\s*[=:]\s*\[\[REDACTED\]\]/gi, "")
    .replace(/\[\[REDACTED(?:_PATH)?\]\]/g, "");
  if (withoutPlaceholders && PRIVATE_PATH.test(withoutPlaceholders)) violations.push("private_path");
  PRIVATE_PATH.lastIndex = 0;
  if (withoutPlaceholders && SECRET_ASSIGNMENT.test(withoutPlaceholders)) violations.push("secret_pattern");
  SECRET_ASSIGNMENT.lastIndex = 0;
  return { ok: violations.length === 0, violations };
}

export const EVIDENCE_STATUS_LABELS = Object.freeze([
  "historically_reproduced",
  "unit_tested",
  "independently_reviewed",
  "runtime_loaded",
  "live_smoke_tested",
]);

export function preserveEvidenceStatusLabels(value = {}) {
  const output = {};
  for (const label of EVIDENCE_STATUS_LABELS) if (Object.prototype.hasOwnProperty.call(value, label)) output[label] = Boolean(value[label]);
  return output;
}
