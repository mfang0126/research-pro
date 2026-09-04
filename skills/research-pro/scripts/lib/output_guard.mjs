/**
 * output_guard.mjs — safe serialization / redaction primitives (Task 4, Lane A).
 *
 * No-dependency, offline, stdlib-only. Program-driven guards (§2.4) that keep
 * secrets and unsafe JS values out of reports, logs, and manifests.
 */

export const UNSAFE_OUTPUT_VALUE = "UNSAFE_OUTPUT_VALUE";

const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const SECRET_PATTERN =
  /(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|session|token|key)\s*[=:]\s*([^\s&,;]+)/gi;

/**
 * Validate that a value is safe to serialize into a report/artifact.
 * Rejects: functions, symbols, bigint, undefined, NaN/±Infinity, control chars
 * in strings, over-long strings, and non-plain objects (incl. cycles via depth cap).
 * Returns { ok: boolean, code?: string, reason?: string }.
 */
export function assertSafeOutputValue(value, opts = {}) {
  const maxStringLength = opts.maxStringLength ?? 10000;
  const depth = opts.depth ?? 0;
  if (depth > 64) return { ok: false, code: UNSAFE_OUTPUT_VALUE, reason: "depth exceeded (cycle?)" };

  const t = typeof value;
  if (value === null) return { ok: true };
  if (t === "string") {
    if (value.length > maxStringLength) return { ok: false, code: UNSAFE_OUTPUT_VALUE, reason: "string too long" };
    if (CONTROL_RE.test(value)) return { ok: false, code: UNSAFE_OUTPUT_VALUE, reason: "control character in string" };
    return { ok: true };
  }
  if (t === "number") {
    if (!Number.isFinite(value)) return { ok: false, code: UNSAFE_OUTPUT_VALUE, reason: "non-finite number" };
    return { ok: true };
  }
  if (t === "boolean") return { ok: true };
  if (t === "undefined" || t === "function" || t === "symbol" || t === "bigint") {
    return { ok: false, code: UNSAFE_OUTPUT_VALUE, reason: `unsafe value kind: ${t}` };
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const r = assertSafeOutputValue(item, { ...opts, depth: depth + 1 });
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  if (t === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return { ok: false, code: UNSAFE_OUTPUT_VALUE, reason: "non-plain object" };
    }
    for (const k of Object.keys(value)) {
      const r = assertSafeOutputValue(value[k], { ...opts, depth: depth + 1 });
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  return { ok: false, code: UNSAFE_OUTPUT_VALUE, reason: `unsupported type ${t}` };
}

/**
 * Replace `key=value` / `key: value` secret declarations with a redacted label
 * so the secret value never reaches logs, trace, or reports.
 */
export function redactText(text) {
  if (typeof text !== "string") return text;
  return text.replace(SECRET_PATTERN, (m, key) => `${key}=[[REDACTED]]`);
}

/** Does the text contain an absolute user-home path (e.g. /Users/<name>/...)? */
export function containsPrivatePath(text) {
  if (typeof text !== "string") return false;
  return /(?:\/Users|\/home)\/[^/\s]+(\/|$)/.test(text);
}
