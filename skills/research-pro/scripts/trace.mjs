#!/usr/bin/env node
/**
 * CLI for research-pro search trace.
 *
 *   node scripts/trace.mjs init --question "..." --depth standard
 *   node scripts/trace.mjs append --run-id ID --file result.json [--sub-q Q1]
 *   cat result.json | node scripts/trace.mjs append --run-id ID --stdin
 *   node scripts/trace.mjs finalize --run-id ID --confidence high
 *   node scripts/trace.mjs prune --days 14
 *   node scripts/trace.mjs status
 *
 * Never prints secrets. Exit 0 even on soft failures (debug path).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initRun,
  appendCall,
  finalizeRun,
  pruneRuns,
  researchProHome,
  runDir,
  traceMode,
} from "./lib/trace.mjs";
import {
  appendCacheRecord,
  cachePath,
  lookupCache,
  makeCacheRecord,
} from "./lib/cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error(`research-pro trace

Commands:
  init       Start a run  (--question --depth --tier --sub-q a,b,c)
  append     Log one search result to debug trace + cache (--run-id --file|--stdin [--sub-q] [--round] [--force-raw])
  record-search  Record host-native/delegated result to debug trace + cross-run cache
  lookup-search  Look up an exact cross-run cache entry before a backend call
  finalize   Close run + write run-log.jsonl row
  prune      Delete runs older than N days (default 14)
  status     Show home / mode / current run / cache path

Env:
  RESEARCH_PRO_HOME   default ~/.config/research-pro
  RESEARCH_PRO_TRACE  off|light|full (default light)
  RESEARCH_PRO_RUN_ID active run id
`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

function csv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const DEFAULT_REQUESTED_TOOLS = {
  quick: "tavily",
  official: "tavily_official",
  deep: "tavily_research",
  realtime: "grok_web",
  community: "tavily_community",
  social: "grok_x",
  scrape: "firecrawl",
  video: "youtube",
  serp: "dataforseo",
  xhs: "xhs",
};

function cacheOptions(args, payload = null) {
  const hints = args.hints ? csv(args.hints) : csv(args.hint || payload?.hint || payload?.requested_hint || "quick");
  const requestedTool = args["requested-tool"] || payload?.requested_tool || (hints.length === 1 ? DEFAULT_REQUESTED_TOOLS[hints[0]] || "" : "");
  return {
    query: args.query || payload?.query || payload?.input || "",
    hints,
    hint: args.hint || payload?.hint || payload?.requested_hint || hints[0] || "",
    scope_key: args["scope-key"] || process.env.RESEARCH_PRO_SCOPE_KEY || "",
    contract_hash: args["contract-hash"] || process.env.RESEARCH_PRO_CONTRACT_HASH || "",
    intention: args.intention || process.env.RESEARCH_PRO_INTENTION || hints[0] || "",
    locale: args.locale || process.env.RESEARCH_PRO_LOCALE || "",
    region: args.region || process.env.RESEARCH_PRO_REGION || "",
    jurisdiction: args.jurisdiction || process.env.RESEARCH_PRO_JURISDICTION || "",
    domain: args.domain || process.env.RESEARCH_PRO_DOMAIN || "",
    source_type: args["source-type"] || process.env.RESEARCH_PRO_SOURCE_TYPE || "",
    record_kind: args["record-kind"] || ((args.hint || payload?.hint || payload?.requested_hint || hints[0]) === "scrape" ? "extract" : "search"),
    limit: args.limit != null ? Number(args.limit) : 8,
    as_of: args["as-of"] || process.env.RESEARCH_PRO_AS_OF || "",
    freshness: args.freshness || process.env.RESEARCH_PRO_FRESHNESS || "",
    requested_tool: requestedTool,
    actual_tool: args["actual-tool"] || payload?.tool || "",
    degraded: args.degraded != null ? args.degraded === "true" || args.degraded === true : null,
    status: args.status || null,
    error: args.error || payload?.error || null,
    run_id: args["run-id"] || process.env.RESEARCH_PRO_RUN_ID || "",
    source: args.source || "host-native",
  };
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (!cmd) usage();

try {
  if (cmd === "init") {
    const sub = args["sub-q"] || args.sub_questions || "";
    const sub_questions = String(sub)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = initRun({
      question: args.question || args.q || "",
      depth: args.depth || "standard",
      tier: args.tier || null,
      sub_questions,
    });
    // machine-friendly one line
    console.log(JSON.stringify(res));
    if (res.run_id) {
      console.error(`trace init run_id=${res.run_id} mode=${res.mode} dir=${res.run_dir}`);
      console.error(`export RESEARCH_PRO_RUN_ID=${res.run_id}`);
    }
    process.exit(0);
  }

  if (cmd === "append") {
    let payload = null;
    let rawText = "";
    if (args.stdin || args._.includes("-")) {
      rawText = await readStdin();
    } else if (args.file || args.f) {
      rawText = fs.readFileSync(args.file || args.f, "utf8");
    } else if (args.payload) {
      rawText = args.payload;
    }
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = { raw_text: rawText.slice(0, 5000) };
      }
    }
    const res = appendCall({
      run_id: args["run-id"] || args.run_id || process.env.RESEARCH_PRO_RUN_ID,
      payload,
      query: args.query || null,
      hint: args.hint || null,
      tool: args.tool || null,
      requested_tool: args["requested-tool"] || null,
      degraded: args.degraded != null ? args.degraded === "true" || args.degraded === true : null,
      elapsed_ms: args["elapsed-ms"] != null ? Number(args["elapsed-ms"]) : null,
      sub_q: args["sub-q"] || args.sub_q || null,
      round: args.round != null ? Number(args.round) : null,
      status: args.status || "ok",
      error: args.error || null,
      force_raw: Boolean(args["force-raw"] || args.full),
      source: args.source || "cli",
    });
    const options = cacheOptions(args, payload);
    const record = makeCacheRecord(payload || {}, options);
    const cache = appendCacheRecord(record, { file: cachePath() });
    console.log(JSON.stringify({ ...res, cache }));
    process.exit(res.ok ? 0 : 0); // soft
  }

  if (cmd === "record-search") {
    let payload = null;
    let rawText = "";
    if (args.stdin || args._.includes("-")) {
      rawText = await readStdin();
    } else if (args.file || args.f) {
      rawText = fs.readFileSync(args.file || args.f, "utf8");
    } else if (args.payload) {
      rawText = args.payload;
    }
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = { raw_text: rawText.slice(0, 5000) };
      }
    }
    const options = cacheOptions(args, payload);
    const debug = appendCall({
      run_id: options.run_id || null,
      payload,
      query: options.query,
      hint: options.hint,
      tool: options.actual_tool || null,
      requested_tool: options.requested_tool || null,
      degraded: options.degraded,
      elapsed_ms: args["elapsed-ms"] != null ? Number(args["elapsed-ms"]) : null,
      sub_q: args["sub-q"] || args.sub_q || null,
      round: args.round != null ? Number(args.round) : null,
      status: options.status || "ok",
      error: options.error,
      force_raw: Boolean(args["force-raw"] || args.full),
      source: options.source,
    });
    const record = makeCacheRecord(payload || {}, options);
    const cache = appendCacheRecord(record, { file: cachePath() });
    console.log(JSON.stringify({ ok: Boolean(cache.ok), debug, cache, cache_key: record.cache_key }));
    process.exit(0);
  }

  if (cmd === "lookup-search") {
    const options = cacheOptions(args, null);
    const result = lookupCache(options, { file: cachePath() });
    console.log(JSON.stringify(result));
    process.exit(0);
  }
  if (cmd === "finalize") {
    let report_text = null;
    if (args["report-file"]) {
      try {
        report_text = fs.readFileSync(args["report-file"], "utf8");
      } catch {
        /* ignore */
      }
    }
    const res = finalizeRun({
      run_id: args["run-id"] || process.env.RESEARCH_PRO_RUN_ID,
      summary: args.summary || null,
      confidence: args.confidence || null,
      tools_used: args["tools-used"]
        ? String(args["tools-used"]).split(",").map((s) => s.trim())
        : null,
      tools_contributed: args["tools-contributed"]
        ? String(args["tools-contributed"]).split(",").map((s) => s.trim())
        : null,
      report_path: args.report || null,
      report_text,
    });
    console.log(JSON.stringify(res));
    process.exit(0);
  }

  if (cmd === "prune") {
    const days = Number(args.days || 14);
    const res = pruneRuns({ days });
    console.log(JSON.stringify(res));
    process.exit(0);
  }

  if (cmd === "status") {
    const home = researchProHome();
    let current = null;
    try {
      current = JSON.parse(fs.readFileSync(path.join(home, "current-run.json"), "utf8"));
    } catch {
      /* none */
    }
    let run_count = 0;
    try {
      run_count = fs.readdirSync(path.join(home, "runs")).length;
    } catch {
      /* none */
    }
    console.log(
      JSON.stringify(
        {
          home,
          mode: traceMode(),
          current,
          run_count,
          cache_file: cachePath(),
          script: path.join(__dirname, "trace.mjs"),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  usage();
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  process.exit(0);
}
