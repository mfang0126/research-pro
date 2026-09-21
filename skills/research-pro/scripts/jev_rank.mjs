#!/usr/bin/env node
/**
 * jev_rank.mjs — batched relevance triage of result rows via TypeSafe's Jev.
 *
 * Scores each row's probability of being about the request (noul). Scores
 * sort and flag rows; they are not evidence and not a hard gate. Thresholds
 * are local defaults pending calibration (see references/jev-judge.md).
 *
 * Usage:
 *   node scripts/jev_rank.mjs '{"request":"...","results":[{"title":"...","snippet":"..."}]}'
 *   node scripts/jev_rank.mjs '{"request":"...","results":[...],"threshold":0.3}' /tmp/rank.json
 *
 * Input JSON:
 *   request    string  (required)
 *   results    array   (required) {id?, source?, title?, snippet?}
 *   threshold  number  (optional) below-threshold rows are listed in "below"
 *
 * Output (stdout): {"ok":true,"scored":[...],...}
 * On failure: {"ok":false,"error":"..."} and exit 1.
 *
 * Env: TYPESAFE_API_KEY | JEV_API_KEY, TYPESAFE_MODEL, RESEARCH_PRO_JEV=off,
 *      RESEARCH_PRO_RUN_ID (optional trace hook)
 */
import fs from "node:fs";
import { rankResults } from "./lib/jev_judge.mjs";
import { appendJevCall } from "./lib/jev_trace.mjs";

function usage() {
  console.error(`Usage: node scripts/jev_rank.mjs '<json>' [output_file]

Required JSON fields:
  request: string
  results: Array<{id?, source?, title?, snippet?}>

Optional:
  threshold: number  (rows below it are grouped in "below")

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
if (!Array.isArray(body.results)) {
  console.error("Error: 'results' must be an array");
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
  const out = await rankResults(body);
  const t = appendJevCall({ kind: "jev_rank", request: out.request, out, input: body });
  if (t && t.ok === false) console.error(`trace append failed (non-fatal): ${t.error}`);
  emit(out, 0);
} catch (err) {
  const out = { ok: false, error: err?.message || String(err), status: err?.status ?? null };
  const t = appendJevCall({ kind: "jev_rank", request: body.request, out: null, input: body, status: "error", error: out.error });
  if (t && t.ok === false) console.error(`trace append failed (non-fatal): ${t.error}`);
  emit(out, 1);
}
