#!/usr/bin/env node
/**
 * research-pro doctor — readiness check without printing secrets.
 *
 * Usage:
 *   node scripts/doctor.mjs
 *   node scripts/doctor.mjs --json
 *   node scripts/doctor.mjs --require-ready   # exit 1 + setup card if not runnable
 *   node scripts/doctor.mjs --hydrate
 *
 * Script READY = runnable true = at least one search backend key/CLI.
 * Host-native web_search is decided by the agent (see SKILL.md).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  capabilityReport,
  hydrateEnv,
  listCredentialSources,
  relevantKeysPresent,
  researchProHome,
  trustHostEnv,
} from "./lib/credentials.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const hydrate = args.includes("--hydrate");
const requireReady = args.includes("--require-ready");

if (hydrate) hydrateEnv();

/**
 * @param {ReturnType<typeof capabilityReport>} report
 * @returns {"none"|"min"|"good"|"full"}
 */
function readinessTier(report) {
  const c = report.capabilities || {};
  const k = report.keys || {};
  const has = (name) => Boolean(k[name]?.present);
  if (!report.runnable) return "none";
  const core =
    has("TAVILY_API_KEY") || has("XAI_API_KEY") || has("OPENROUTER_API_KEY");
  const rich =
    has("FIRECRAWL_API_KEY") ||
    has("YOUTUBE_API_KEY") ||
    (has("DATAFORSEO_LOGIN") && has("DATAFORSEO_PASSWORD"));
  if (core && (c.x_twitter || c.deep_research) && rich) return "full";
  if (core && (c.quick_search || c.realtime_web)) return "good";
  return "min";
}

function printSetupCard() {
  const home = researchProHome();
  console.error(`## research-pro 未就绪 (script READY=false)

需要至少一个搜索后端，当前 script 侧不可用。

### 最快修复（通用）
\`\`\`bash
mkdir -p "${home}" && chmod 700 "${home}"
cp "${baseDir}/env.example" "${home}/.env"
# 编辑 ${home}/.env ，填入任意一个:
#   TAVILY_API_KEY=
#   XAI_API_KEY=
#   OPENROUTER_API_KEY=
chmod 600 "${home}/.env"
node "${baseDir}/scripts/doctor.mjs --require-ready"
\`\`\`

或:
\`\`\`bash
bash "${baseDir}/scripts/install.sh"
# 再编辑 ~/.config/research-pro/.env
\`\`\`

### Host 例外
若本 agent 已有内置 web_search / x_search，agent 可将 READY=true 并继续（仅用 host 工具）。
否则必须先完成上面配置。

详见: ${baseDir}/SETUP.md
`);
}

const report = capabilityReport();
const sources = listCredentialSources().map((s) => ({
  id: s.id,
  path: s.path || null,
  keys_present: relevantKeysPresent(s.map),
}));
const tier = readinessTier(report);

const payload = {
  ...report,
  ready: report.runnable,
  tier,
  trust_host_env: trustHostEnv(),
  credential_sources_found: sources,
  host_note:
    "If this host has built-in web_search/x_search, agent may set READY=true even when script ready=false.",
};

if (jsonOut) {
  console.log(JSON.stringify(payload, null, 2));
  if (requireReady && !report.runnable) {
    printSetupCard();
    process.exit(1);
  }
  process.exit(report.runnable ? 0 : 1);
}

const line = (ok, label, extra = "") => {
  const mark = ok ? "OK     " : "MISSING";
  console.log(`  ${mark}  ${label}${extra ? `  (${extra})` : ""}`);
};

console.log("research-pro readiness");
console.log(`home: ${report.home}`);
console.log(`trust_host_env: ${trustHostEnv() ? "on" : "off (RESEARCH_PRO_TRUST_HOST_ENV=0)"}`);
console.log(`tier: ${tier}`);
console.log(`ready: ${report.runnable ? "YES" : "NO"}`);
console.log("");
console.log("Keys:");
for (const [k, v] of Object.entries(report.keys)) {
  line(v.present, k, v.source || "not found");
}
console.log("");
console.log("CLIs:");
for (const [k, v] of Object.entries(report.bins)) {
  line(v, k);
}
console.log("");
console.log("Capabilities:");
for (const [k, v] of Object.entries(report.capabilities)) {
  line(v, k);
}
console.log("");
console.log(`Runnable: ${report.runnable ? "YES" : "NO"}`);
console.log(`Minimum: ${report.minimum}`);
console.log("");
console.log("Credential sources discovered (paths only):");
if (!sources.length) {
  console.log("  (none — export keys or create ~/.config/research-pro/.env)");
  console.log("  see env.example and SETUP.md");
} else {
  for (const s of sources) {
    console.log(
      `  - ${s.id}: ${s.path || "(memory)"}  [${s.keys_present.join(", ") || "no keys"}]`
    );
  }
}

if (requireReady && !report.runnable) {
  console.log("");
  printSetupCard();
  process.exit(1);
}

process.exit(report.runnable ? 0 : 1);
