/**
 * url_policy.mjs — deterministic URL identity / safety primitives (Task 4, Lane A).
 *
 * No-dependency, offline, stdlib-only. Owns the program-driven URL invariants
 * (§2.4 decision ownership): canonicalization, safety classification, redaction,
 * and the coarse final-URL status used by the event contract.
 *
 * Convention: throw on malformed input with `error.code = URL_MALFORMED` so
 * callers can distinguish "cannot parse" from "parsed but unsafe".
 */

export const URL_MALFORMED = "URL_MALFORMED";

function urlError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Parse strictly; any non-parseable input raises URL_MALFORMED. */
function parseUrl(input) {
  if (typeof input !== "string" || input.length === 0 || input.length > 4096) {
    throw urlError(URL_MALFORMED, `cannot canonicalize: not a usable URL string`);
  }
  let u;
  try {
    u = new URL(input);
  } catch {
    throw urlError(URL_MALFORMED, `malformed URL: ${input.slice(0, 80)}`);
  }
  return u;
}

/**
 * Deterministic canonical form: lowercase scheme+host, default ports dropped,
 * path/search/hash preserved verbatim (query order and fragment are identity-
 * significant for evidence). Idempotent: canonicalize(canonicalize(x))===x.
 */
export function canonicalizeUrl(input) {
  const u = parseUrl(input);
  const scheme = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase();
  const port =
    (u.port && !(scheme === "http:" && u.port === "80") && !(scheme === "https:" && u.port === "443")) ? `:${u.port}` : "";
  return `${scheme}//${host}${port}${u.pathname}${u.search}${u.hash}`;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function isLoopbackHost(host) {
  const h = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
  if (h === "::ffff:127.0.0.1") return true;
  if (IPV4.test(h)) {
    const parts = h.split(".");
    if (parts.some((p) => /^\d{1,3}$/.test(p) && Number(p) > 255)) return false;
    return Number(parts[0]) === 127;
  }
  return false;
}

function isPrivateHost(host) {
  const h = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (!IPV4.test(h)) return false;
  const [a, b] = h.split(".").map(Number);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Fine-grained safety classification. Statuses:
 *   clean | unsafe_scheme | credential_in_url | loopback | private
 * Throws URL_MALFORMED when the input cannot be parsed at all.
 */
export function classifyUrl(input) {
  const u = parseUrl(input);
  const scheme = u.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") return { status: "unsafe_scheme", scheme };
  if (u.username || u.password) return { status: "credential_in_url" };
  const host = u.hostname.toLowerCase();
  if (isLoopbackHost(host)) return { status: "loopback", host };
  if (isPrivateHost(host)) return { status: "private", host };
  return { status: "clean" };
}

/** Sensitive query parameters removed by redactUrl / redactText. */
const SENSITIVE_QUERY_PARAMS = new Set([
  "api_key",
  "apikey",
  "api-key",
  "access_token",
  "auth",
  "auth_token",
  "client_secret",
  "key",
  "password",
  "private_token",
  "secret",
  "session",
  "sig",
  "signature",
  "token",
]);

/** Strip userinfo and sensitive query params; everything else is preserved. */
export function redactUrl(input) {
  const u = parseUrl(input);
  u.username = "";
  u.password = "";
  const kept = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (!SENSITIVE_QUERY_PARAMS.has(k.toLowerCase())) kept.push([k, v]);
  }
  u.search = kept.length ? `?${kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
  return u.toString();
}

/** Coarse, never-throwing status for the event `final_url_status` field. */
export function finalUrlStatus(input) {
  if (typeof input !== "string" || input.length === 0) return { status: "malformed" };
  let u;
  try {
    u = new URL(input);
  } catch {
    return { status: "malformed" };
  }
  const scheme = u.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") return { status: "unsafe_scheme" };
  if (u.username || u.password) return { status: "credential_present" };
  const host = u.hostname.toLowerCase();
  if (isLoopbackHost(host)) return { status: "loopback" };
  if (isPrivateHost(host)) return { status: "private" };
  return { status: "clean" };
}
