/**
 * archive.mjs — durable-package building blocks (Task 4, Lane A).
 *
 * No-dependency, offline, stdlib-only. SHA-256 primitives, manifest entries,
 * deterministic package ids, and the root↔nested byte-identical mirror drift
 * report consumed by the lane's sync check (I-015/I-021).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Standard SHA-256 hex digest; accepts string or Buffer/Uint8Array. */
export function sha256Hex(data) {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  return createHash("sha256").update(buf).digest("hex");
}

/** Manifest-style entry captured from bytes on disk. */
export function entryFromBytes(relPath, buffer) {
  return { path: relPath, bytes: buffer.length, sha256: sha256Hex(buffer) };
}

/** Normalize a caller-provided manifest entry (bytes + sha256 + metadata). */
export function manifestEntry(entry) {
  const out = { ...entry };
  if (typeof out.bytes !== "number" || !Number.isInteger(out.bytes) || out.bytes < 0) {
    throw new Error("manifestEntry: bytes must be a non-negative integer");
  }
  if (typeof out.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(out.sha256)) {
    throw new Error("manifestEntry: sha256 must be a 64-char hex digest");
  }
  return out;
}

/**
 * Deterministic package id: SHA-256 over the canonical (key-sorted) JSON of the
 * identity fields, so the same run+contract always yields the same package id.
 */
export function packageId(identity) {
  const sorted = {};
  for (const key of Object.keys(identity || {}).sort()) sorted[key] = identity[key];
  return sha256Hex(JSON.stringify(sorted));
}

/**
 * Compare root ↔ nested package copies byte-identically for the given relative
 * paths. Returns { ok, differing, missing } — never silently copies.
 */
export function syncDriftReport({ rootDir, nestedDir, relativePaths }) {
  const differing = [];
  const missing = [];
  for (const rel of relativePaths) {
    let rootBuf = null;
    let nestedBuf = null;
    try {
      rootBuf = readFileSync(path.join(rootDir, rel));
    } catch {
      rootBuf = null;
    }
    try {
      nestedBuf = readFileSync(path.join(nestedDir, rel));
    } catch {
      nestedBuf = null;
    }
    if (rootBuf === null || nestedBuf === null) {
      missing.push(rel);
      continue;
    }
    if (!rootBuf.equals(nestedBuf)) differing.push(rel);
  }
  return { ok: differing.length === 0 && missing.length === 0, differing, missing };
}
