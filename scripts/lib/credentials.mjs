/**
 * research-pro credential resolver
 *
 * Rules:
 * 1) process.env wins — never override existing values
 * 2) fill-missing only from known sources
 * 3) never print secret values
 * 4) host/env files: only allowlisted research-pro keys enter memory
 *
 * Resolution order for missing keys:
 *   process.env
 *   RESEARCH_PRO_ENV_FILE
 *   $RESEARCH_PRO_HOME/.env  (default ~/.config/research-pro/.env)
 *   ~/.config/research-pro/.env
 *   host adapters (fill-missing) when RESEARCH_PRO_TRUST_HOST_ENV != 0:
 *     Hermes:   ~/.hermes/.env
 *     OpenClaw: ~/.openclaw/.env + openclaw.json env / skills.entries
 *   optional CWD ./.env when RESEARCH_PRO_LOAD_CWD_ENV=1
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readEnvFile } from "./envfile.mjs";

/** Canonical keys used by research-pro */
export const CANONICAL_KEYS = [
  "TAVILY_API_KEY",
  "XAI_API_KEY",
  "OPENROUTER_API_KEY",
  "FIRECRAWL_API_KEY",
  "YOUTUBE_API_KEY",
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD",
  "REDDIT_SESSION",
  "TOKEN_V2",
];

/** Alias map: alias -> canonical */
const ALIASES = {
  YOUTUBE_API: "YOUTUBE_API_KEY",
  X_AI: "XAI_API_KEY",
  XAI_KEY: "XAI_API_KEY",
};

/**
 * Whether to read Hermes/OpenClaw host credential stores.
 * Default true. Set RESEARCH_PRO_TRUST_HOST_ENV=0 for process + research-pro home only.
 */
export function trustHostEnv() {
  return process.env.RESEARCH_PRO_TRUST_HOST_ENV !== "0";
}

/**
 * Keep only research-pro keys (canonical + aliases). Drops unrelated secrets
 * so host .env files never fully reside in process memory as a key bag.
 * @param {Record<string, string>} map
 * @returns {Record<string, string>}
 */
export function pickAllowedKeys(map) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!map) return out;
  for (const k of CANONICAL_KEYS) {
    if (nonEmpty(map[k])) out[k] = map[k];
  }
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (nonEmpty(map[alias])) {
      out[alias] = map[alias];
      if (!nonEmpty(out[canonical])) out[canonical] = map[alias];
    }
  }
  return out;
}

/**
 * @returns {string}
 */
export function researchProHome() {
  const home = process.env.RESEARCH_PRO_HOME;
  if (home && home.trim()) return expandHome(home.trim());
  return path.join(os.homedir(), ".config", "research-pro");
}

/**
 * @param {string} p
 */
function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * @param {unknown} v
 * @returns {v is string}
 */
function nonEmpty(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Apply alias: if canonical empty but alias set in map/env, copy.
 * @param {Record<string, string>} map
 */
function applyAliasesToMap(map) {
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (!nonEmpty(map[canonical]) && nonEmpty(map[alias])) {
      map[canonical] = map[alias];
    }
  }
}

/**
 * @param {string} filePath
 * @param {string} sourceId
 * @returns {{ id: string, path: string, map: Record<string, string> } | null}
 */
function loadDotenvSource(filePath, sourceId) {
  const raw = readEnvFile(filePath);
  if (!raw) return null;
  const map = pickAllowedKeys(raw);
  applyAliasesToMap(map);
  if (!Object.keys(map).length) return null;
  return { id: sourceId, path: filePath, map };
}

/**
 * @param {string} filePath
 * @param {string} sourceId
 * @param {(j: any) => Record<string, string>} extract
 */
function loadJsonSource(filePath, sourceId, extract) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const j = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const map = pickAllowedKeys(extract(j) || {});
    applyAliasesToMap(map);
    if (!Object.keys(map).length) return null;
    return { id: sourceId, path: filePath, map };
  } catch {
    return null;
  }
}

/**
 * Flatten OpenClaw-style skill entries for known keys.
 * @param {any} j
 * @returns {Record<string, string>}
 */
function extractAgentJsonEnv(j) {
  /** @type {Record<string, string>} */
  const map = {};
  const env = j?.env;
  if (env && typeof env === "object") {
    for (const [k, v] of Object.entries(env)) {
      if (nonEmpty(v)) map[k] = String(v);
    }
    const vars = env.vars;
    if (vars && typeof vars === "object") {
      for (const [k, v] of Object.entries(vars)) {
        if (nonEmpty(v) && !nonEmpty(map[k])) map[k] = String(v);
      }
    }
  }

  const entries = j?.skills?.entries;
  if (entries && typeof entries === "object") {
    const skillNames = [
      "research-pro",
      "grok-search",
      "search-x",
      "xai",
      "tavily",
      "firecrawl",
    ];
    for (const name of skillNames) {
      const e = entries[name];
      if (!e || typeof e !== "object") continue;
      if (nonEmpty(e.apiKey)) {
        // Best-effort mapping by skill name
        if (name === "tavily" && !map.TAVILY_API_KEY) map.TAVILY_API_KEY = String(e.apiKey);
        else if (
          (name === "grok-search" || name === "search-x" || name === "xai") &&
          !map.XAI_API_KEY
        ) {
          map.XAI_API_KEY = String(e.apiKey);
        } else if (name === "firecrawl" && !map.FIRECRAWL_API_KEY) {
          map.FIRECRAWL_API_KEY = String(e.apiKey);
        } else if (name === "research-pro") {
          // generic skill apiKey → prefer XAI if nothing else (legacy)
          if (!map.XAI_API_KEY) map.XAI_API_KEY = String(e.apiKey);
        }
      }
      if (e.env && typeof e.env === "object") {
        for (const [k, v] of Object.entries(e.env)) {
          if (nonEmpty(v) && !nonEmpty(map[k])) map[k] = String(v);
        }
      }
    }
  }
  return map;
}

/**
 * Build ordered credential sources (excluding process.env).
 * @returns {Array<{ id: string, path?: string, map: Record<string, string> }>}
 */
export function listCredentialSources() {
  const home = os.homedir();
  /** @type {Array<{ id: string, path?: string, map: Record<string, string> }>} */
  const sources = [];

  const explicit = process.env.RESEARCH_PRO_ENV_FILE;
  if (nonEmpty(explicit)) {
    const s = loadDotenvSource(expandHome(explicit), "RESEARCH_PRO_ENV_FILE");
    if (s) sources.push(s);
  }

  const rph = researchProHome();
  const primary = loadDotenvSource(path.join(rph, ".env"), "research-pro-home");
  if (primary) sources.push(primary);

  // If RESEARCH_PRO_HOME is customized, still check default generic path once
  const defaultGeneric = path.join(home, ".config", "research-pro", ".env");
  if (path.join(rph, ".env") !== defaultGeneric) {
    const s = loadDotenvSource(defaultGeneric, "config-research-pro");
    if (s) sources.push(s);
  }

  // Host adapters (optional — disable with RESEARCH_PRO_TRUST_HOST_ENV=0)
  if (trustHostEnv()) {
    const hermes = loadDotenvSource(path.join(home, ".hermes", ".env"), "hermes.env");
    if (hermes) sources.push(hermes);

    const openclawEnv = loadDotenvSource(
      path.join(home, ".openclaw", ".env"),
      "openclaw.env"
    );
    if (openclawEnv) sources.push(openclawEnv);

    const openclawJson = loadJsonSource(
      path.join(home, ".openclaw", "openclaw.json"),
      "openclaw.json",
      extractAgentJsonEnv
    );
    if (openclawJson) sources.push(openclawJson);
  }

  // CWD .env is lowest trust — opt-in only
  if (process.env.RESEARCH_PRO_LOAD_CWD_ENV === "1") {
    const cwdEnv = loadDotenvSource(path.join(process.cwd(), ".env"), "cwd.env");
    if (cwdEnv) sources.push(cwdEnv);
  }

  return sources;
}

/**
 * Which research-pro keys a source map can supply (names only, no values).
 * Includes alias keys if present.
 * @param {Record<string, string>} map
 * @returns {string[]}
 */
export function relevantKeysPresent(map) {
  const names = new Set([
    ...CANONICAL_KEYS,
    ...Object.keys(ALIASES),
  ]);
  return [...names].filter((k) => nonEmpty(map[k])).sort();
}

/**
 * Resolve a single key without printing it.
 * Side effect: fills process.env[key] when found from a file source.
 *
 * @param {string} name canonical or alias
 * @returns {{ name: string, value: string | null, source: string | null }}
 */
export function resolveKey(name) {
  const canonical = ALIASES[name] || name;

  // 1) process.env canonical
  if (nonEmpty(process.env[canonical])) {
    return { name: canonical, value: process.env[canonical], source: "process.env" };
  }

  // 1b) process.env alias
  for (const [alias, can] of Object.entries(ALIASES)) {
    if (can === canonical && nonEmpty(process.env[alias])) {
      process.env[canonical] = process.env[alias];
      return {
        name: canonical,
        value: process.env[alias],
        source: `process.env(${alias})`,
      };
    }
  }

  // 2+) fill-missing from sources
  for (const src of listCredentialSources()) {
    const v = src.map[canonical];
    if (nonEmpty(v)) {
      process.env[canonical] = v;
      return { name: canonical, value: v, source: src.id };
    }
    // alias inside source map
    for (const [alias, can] of Object.entries(ALIASES)) {
      if (can === canonical && nonEmpty(src.map[alias])) {
        process.env[canonical] = src.map[alias];
        return { name: canonical, value: src.map[alias], source: src.id };
      }
    }
  }

  return { name: canonical, value: null, source: null };
}

/**
 * Resolve all canonical keys; fill process.env for found ones.
 * @param {string[]} [keys]
 * @returns {Record<string, { present: boolean, source: string | null }>}
 */
export function resolveAll(keys = CANONICAL_KEYS) {
  /** @type {Record<string, { present: boolean, source: string | null }>} */
  const out = {};
  for (const k of keys) {
    const r = resolveKey(k);
    out[r.name] = { present: Boolean(r.value), source: r.source };
  }
  return out;
}

/**
 * Ensure process.env is hydrated for all known keys.
 * @returns {Record<string, { present: boolean, source: string | null }>}
 */
export function hydrateEnv() {
  return resolveAll(CANONICAL_KEYS);
}

/**
 * Capability snapshot for doctor / agents (no secrets).
 */
export function capabilityReport() {
  const status = hydrateEnv();

  const has = (k) => Boolean(status[k]?.present);
  const tavily = has("TAVILY_API_KEY");
  const xai = has("XAI_API_KEY");
  const openrouter = has("OPENROUTER_API_KEY");
  const firecrawl = has("FIRECRAWL_API_KEY");
  const youtube = has("YOUTUBE_API_KEY");
  const dataforseo = has("DATAFORSEO_LOGIN") && has("DATAFORSEO_PASSWORD");
  const reddit = has("REDDIT_SESSION");

  // CLIs (best-effort PATH check)
  const hasBin = (bin) => {
    const pathEnv = process.env.PATH || "";
    for (const dir of pathEnv.split(path.delimiter)) {
      try {
        const p = path.join(dir, bin);
        if (fs.existsSync(p)) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  };

  const bins = {
    tvly: hasBin("tvly"),
    firecrawl: hasBin("firecrawl"),
    yt_dlp: hasBin("yt-dlp"),
  };

  const capabilities = {
    quick_search: tavily || xai || openrouter,
    realtime_web: xai || tavily || openrouter,
    x_twitter: xai,
    deep_research: tavily,
    scrape: firecrawl || tavily,
    youtube: youtube || bins.yt_dlp,
    serp: dataforseo,
    reddit_auth: reddit,
  };

  // READY for research = at least one configured web search API key
  // (CLI presence alone is not enough — tvly still needs TAVILY_API_KEY)
  const runnable = Boolean(tavily || xai || openrouter);

  return {
    home: researchProHome(),
    keys: status,
    bins,
    capabilities,
    runnable,
    minimum:
      "Need at least one of: TAVILY_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY (or a host-native web_search tool).",
  };
}
