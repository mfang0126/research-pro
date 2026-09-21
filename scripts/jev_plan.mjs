#!/usr/bin/env node
/**
 * jev_plan.mjs — fast pre-search planning via TypeSafe's Jev (optional layer).
 *
 * Code proposes keyword-query candidates; Jev selects the query, time window
 * and likely smart-search hints in one batched call (~1s). Fail-open: the
 * caller may always ignore the output and proceed with the normal flow.
 *
 * Usage:
 *   node scripts/jev_plan.mjs '{"request":"...","now":"2026-09-21"}'
 *   node scripts/jev_plan.mjs '{"request":"..."}' /tmp/plan.json
 *
 * Input JSON:
 *   request     string   (required) the sub-question
 *   now         YYYY-MM-DD (optional; default: today)
 *   candidates  string[] (optional; default: rule-based candidates)
 *   targets     string[] (optional; subset of quick,official,deep,realtime,community,social,video)
 *   sub_q       string   (optional; recorded in trace when a run is active)
 *
 * Output (stdout): {"ok":true,...} — see references/jev-judge.md.
 * On failure: {"ok":false,"error":"..."} and exit 1.
 *
 * Env: TYPESAFE_API_KEY | JEV_API_KEY, TYPESAFE_MODEL, RESEARCH_PRO_JEV=off,
 *      RESEARCH_PRO_RUN_ID (optional trace hook)
 */
import fs from "node:fs";
import { inferPlan } from "./lib/jev_judge.mjs";
import { appendJevCall } from "./lib/jev_trace.mjs";

function usage() {
  console.error(`Usage: node scripts/jev_plan.mjs '<json>' [output_file]

Required JSON field:
  request: string

Optional:
  now: YYYY-MM-DD
  candidates: string[]
  targets: string[]  (quick,official,deep,realtime,community,social,video)
  sub_q: string      (trace label when a run is active)

Key: TYPESAFE_API_KEY or JEV_API_KEY via credentials.mjs (never printed).
Doctor: node scripts/doctor.mjs`);
  process.exit(2);
}

const jsonInputRaw = process.argv[2];
const outputFile = process.argv[3];
if (!jsonInputRaw || jsonInputRaw.startsWith("--")) usage();

let body;
try {
  body = JSON.parse(jsonInputRaw);
} catch {
  console.error("Error: Invalid JSON input");
  process.exit(2);
}
if (!body || typeof body.request !== "string" || !body.request.trim()) {
  console.error("Error: 'request' field is required");
  process.exit(2);
}

function emit(obj, code) {
  const text = JSON.stringify(obj, null, 2);
  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, text);
    } catch (e) {
      console.error(`Error writing ${outputFile}: ${e.message}`);
    }
  }
  console.log(text);
  process.exit(code);
}

try {
  const out = await inferPlan(body);
  const t = appendJevCall({ kind: "jev_plan", request: out.request, out, input: body });
  if (t && t.ok === false) console.error(`trace append failed (non-fatal): ${t.error}`);
  emit(out, 0);
} catch (err) {
  const out = { ok: false, error: err?.message || String(err), status: err?.status ?? null };
  const t = appendJevCall({ kind: "jev_plan", request: body.request, out: null, input: body, status: "error", error: out.error });
  if (t && t.ok === false) console.error(`trace append failed (non-fatal): ${t.error}`);
  emit(out, 1);
}
