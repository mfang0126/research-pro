#!/usr/bin/env node
/**
 * jev_client.mjs — minimal TypeSafe Jev client for research-pro.
 *
 * Jev is a decisions model: it answers typed questions (noul = P(yes),
 * choice = option + probabilities) about a supplied `state`. It does not
 * generate prose. Used by jev_plan.mjs and jev_rank.mjs.
 *
 * - Direct API only: POST https://api.typesafe.ai/v1/systemone
 * - Key: TYPESAFE_API_KEY (alias JEV_API_KEY), via credentials.mjs; never printed
 * - No retry by default: a failure is recorded and surfaced, not hammered
 * - `questions` MUST be a record/object; an array is rejected by the API (400)
 * - Model alias `jev-latest` (observed jev-1.13.0, 2026-09); override with TYPESAFE_MODEL
 * - Kill switch: RESEARCH_PRO_JEV=off
 *
 * Pattern adapted from superagents-lab/jev-search (src/lib/typesafe.ts,
 * MIT License, Copyright (c) 2026 Search1API).
 */
import { resolveKey } from "./credentials.mjs";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const DEFAULT_TIMEOUT_MS = 20000;

export class JevError extends Error {
  /**
   * @param {number} status HTTP status, or 0 for local/transport failures
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = "JevError";
    this.status = status;
  }
}

/** Kill switch: RESEARCH_PRO_JEV=off disables the whole layer. */
export function jevDisabled() {
  return String(process.env.RESEARCH_PRO_JEV || "").trim().toLowerCase() === "off";
}

/** Availability snapshot without calling the API (no secrets). */
export function jevStatus() {
  const key = resolveKey("TYPESAFE_API_KEY");
  const disabled = jevDisabled();
  return {
    disabled,
    available: Boolean(key.value) && !disabled,
    key_name: key.name,
    key_source: key.source,
  };
}

function failureMessage(status) {
  if (status === 402) return "Jev credit exhausted or not enabled (HTTP 402).";
  if (status === 429) return "Jev is rate-limited (HTTP 429).";
  if (status >= 500) return "Jev is temporarily unavailable (HTTP " + status + ").";
  return `Jev could not process this request (HTTP ${status}).`;
}

/**
 * One batched System One call. All questions run in a single parallel pass,
 * so batching aggressively is free.
 *
 * @param {unknown} state all context (text/JSON); keep within 64k tokens
 * @param {Record<string, {type: string, instructions: string, criteria?: unknown}>} questions
 * @param {{model?: string, timeoutMs?: number}} [opts]
 * @returns {Promise<{model: string, provider: string, answers: Record<string, unknown>, usage: {input_tokens: number, output_tokens: number}, latencyMs: number}>}
 */
export async function systemOne(state, questions, opts = {}) {
  if (jevDisabled()) {
    throw new JevError(0, "Jev layer disabled (RESEARCH_PRO_JEV=off).");
  }
  const key = resolveKey("TYPESAFE_API_KEY");
  if (!key.value) {
    throw new JevError(0, "TYPESAFE_API_KEY not set (alias JEV_API_KEY). Run: node scripts/doctor.mjs");
  }
  if (!questions || typeof questions !== "object" || Array.isArray(questions)) {
    throw new JevError(0, "questions must be a plain object (record), not an array.");
  }

  const model = opts.model || process.env.TYPESAFE_MODEL || DEFAULT_MODEL;
  const timeoutMs = Number(opts.timeoutMs || process.env.RESEARCH_PRO_JEV_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const started = Date.now();

  let res;
  try {
    res = await fetch(JEV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, state, questions }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const why = err && err.name === "TimeoutError" ? `timeout after ${timeoutMs}ms` : "network error";
    throw new JevError(0, `Jev request failed: ${why}.`);
  }

  const latencyMs = Date.now() - started;

  if (!res.ok) {
    // Provider error bodies are implementation details and may echo request data.
    await res.body?.cancel().catch(() => undefined);
    throw new JevError(res.status, failureMessage(res.status));
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    throw new JevError(0, "Jev returned a non-JSON response.");
  }

  return {
    model: body?.model ?? model,
    provider: "typesafe",
    answers: body?.answers ?? {},
    usage: {
      input_tokens: body?.usage?.input_tokens ?? 0,
      output_tokens: body?.usage?.output_tokens ?? 0,
    },
    latencyMs,
  };
}
