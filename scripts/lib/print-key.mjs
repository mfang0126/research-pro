#!/usr/bin/env node
/**
 * DEPRECATED for agent workflows: prints secret to stdout (may enter transcripts).
 * Prefer: resolveKey() inside Node scripts (see research.mjs, grok_search.mjs).
 *
 * Kept for rare interactive debugging only.
 * Usage: node scripts/lib/print-key.mjs TAVILY_API_KEY
 */
import { resolveKey } from "./credentials.mjs";

const name = process.argv[2];
if (!name) {
  console.error("Usage: print-key.mjs <ENV_NAME>");
  console.error("DEPRECATED: prefer scripts that call resolveKey() in-process.");
  process.exit(2);
}

const r = resolveKey(name);
if (!r.value) {
  console.error(`Missing ${r.name}`);
  process.exit(1);
}
process.stdout.write(r.value);
