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

import { isIP } from "node:net";

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

function normalizeHost(host) {
  return String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
}

function ipv4Parts(host) {
  if (!IPV4.test(host)) return null;
  const parts = host.split(".").map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null;
}

function ipv4Safety(parts) {
  if (!parts) return null;
  const [a, b] = parts;
  if (a === 127 || (a === 0 && parts.every((part) => part === 0))) return "loopback";
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return "private";
  return null;
}

function ipv6Hextets(host) {
  const h = normalizeHost(host);
  if (isIP(h) !== 6) return null;
  const [leftText, rightText] = h.split("::");
  const expand = (text) => {
    if (!text) return [];
    const pieces = text.split(":");
    const result = [];
    for (const piece of pieces) {
      if (piece.includes(".")) {
        const parts = ipv4Parts(piece);
        if (!parts) return null;
        result.push((parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]);
      } else if (/^[0-9a-f]{1,4}$/i.test(piece)) {
        result.push(Number.parseInt(piece, 16));
      } else {
        return null;
      }
    }
    return result;
  };
  const left = expand(leftText);
  const right = expand(rightText);
  if (!left || !right) return null;
  if (h.includes("::")) {
    const zeros = 8 - left.length - right.length;
    if (zeros < 1) return null;
    return [...left, ...Array.from({ length: zeros }, () => 0), ...right];
  }
  return left.length === 8 ? left : null;
}

function ipv6Safety(host) {
  const parts = ipv6Hextets(host);
  if (!parts) return null;
  const mapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  if (mapped) return ipv4Safety([(parts[6] >> 8) & 0xff, parts[6] & 0xff, (parts[7] >> 8) & 0xff, parts[7] & 0xff]);
  if (parts.every((part) => part === 0) || (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1)) return "loopback";
  if ((parts[0] & 0xfe00) === 0xfc00) return "private"; // fc00::/7 ULA
  if ((parts[0] & 0xffc0) === 0xfe80) return "private"; // fe80::/10 link-local
  return null;
}

function hostSafety(host) {
  const h = normalizeHost(host);
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return "loopback";
  return ipv4Safety(ipv4Parts(h)) || ipv6Safety(h);
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
  const hostStatus = hostSafety(host);
  if (hostStatus) return { status: hostStatus, host };
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
  const hostStatus = hostSafety(host);
  if (hostStatus) return { status: hostStatus };
  return { status: "clean" };
}
