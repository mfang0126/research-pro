#!/usr/bin/env node
/**
 * run-with-creds.mjs — hydrate research-pro allowlisted credentials into the
 * environment, then exec the given command with that env inherited.
 *
 * WHY: third-party CLIs (tvly, firecrawl, youtube_transcript_api, ...) read
 * their keys from process.env, but nothing hydrates their env — the .env
 * sources (~/.hermes/.env, ~/.openclaw/.env, ~/.config/research-pro/.env) are
 * only loaded in-process by credentials.mjs. In-process Node scripts
 * (grok_search.mjs, research.mjs) call resolveKey() themselves; raw CLIs can't.
 * This shim closes that gap so `doctor` reporting ready === CLI actually works.
 *
 * SAFE: secrets only ever enter the CHILD process environment. Nothing is
 * printed to stdout/stderr, so no key can leak into a transcript. (Contrast
 * lib/print-key.mjs, which is deprecated precisely because it prints secrets.)
 *
 * Usage:
 *   node scripts/run-with-creds.mjs tvly search "query"
 *   node scripts/run-with-creds.mjs tvly extract "https://reddit.com/..."
 *   node scripts/run-with-creds.mjs firecrawl scrape "https://url"
 */
import { spawn } from "node:child_process";
import { hydrateEnv } from "./lib/credentials.mjs";

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("Usage: run-with-creds.mjs <command> [args...]");
  process.exit(2);
}

// hydrateEnv() mutates process.env for every allowlisted key found in sources.
hydrateEnv();

const [cmd, ...args] = argv;
const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
child.on("error", (e) => {
  console.error(`run-with-creds: failed to spawn '${cmd}': ${e.message}`);
  process.exit(127);
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
