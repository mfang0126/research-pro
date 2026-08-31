#!/usr/bin/env node
/**
 * Offline regression checks for the Search Contract gate.
 * This deliberately reads fixtures/specification only and makes no external calls.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const skillPath = path.join(root, "SKILL.md");
const fixturesPath = path.join(here, "test_prompts.json");

function fixtureById(fixtures, id) {
  const fixture = fixtures.evals.find((entry) => entry.id === id);
  assert(fixture, `missing regression fixture ${id}`);
  return fixture;
}

function hasCriterion(fixture, text) {
  return fixture.success_criteria?.some((criterion) => criterion.includes(text));
}

async function main() {
  const [skill, fixtureText] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(fixturesPath, "utf8"),
  ]);
  const fixtures = JSON.parse(fixtureText);

  assert.match(skill, /^version: 3\.17\.1-mf$/m, "version must be 3.17.1-mf");
  assert.match(
    skill,
    /`clarify` 的 `question` 参数必须包含完整的、紧凑的 Search Contract/,
    "messaging clarifies must carry the visible contract in the question field"
  );
  assert.match(
    skill,
    /不得只写“是否继续”或“是否按以上范围”这类没有上下文的问题/,
    "generic context-free confirmation prompts must be forbidden"
  );
  assert.match(
    skill,
    /`choices` 只能放短的确认标签，不能成为唯一的范围说明/,
    "choices must not be the only place carrying the research scope"
  );
  assert.match(skill, /host_native_trace\.py/, "host-native retrievals must use the trace bridge");
  assert.match(skill, /强制写入 `raw\/<call_id>\.json`/, "host-native bridge must persist raw evidence");
  assert.match(skill, /data\.web.*results\[\]/, "host-native data.web results must be normalized");
  assert.match(
    skill,
    /唯一流程是 `DRAFT` → `CONTRACT_ACCEPTED` → `SEARCHING`/,
    "interactive state machine must require explicit acceptance before searching"
  );
  assert.match(
    skill,
    /必须先把 `DRAFT` contract 展示给用户/,
    "interactive contracts must be displayed"
  );
  assert.match(
    skill,
    /用户只是重述、补充、澄清或换一种说法描述主题，\*\*不是\*\* contract confirmation/,
    "topic restatement must not count as confirmation"
  );
  assert.match(
    skill,
    /不得用内部自检、清晰度判断或 `accepted-selfcheck` 替代用户确认/,
    "accepted-selfcheck bypass must be forbidden"
  );
  assert.match(
    skill,
    /仅当用户给出\*\*一个\*\*明确 URL\/文件.*没有跨源比较、评估、补充背景或推断/s,
    "NARROW_SELFCHECK must remain a one-source read/extract/summarize exception"
  );
  assert.match(
    skill,
    /`decision`、锚定的 `object`、`in_scope`、`out_of_scope`、`answer_shape`、`anchor_evidence`/,
    "headless path must require all six pre-approved fields"
  );
  assert.match(skill, /删除旧方向的子问题、query seeds、计划工具、URL、发现和候选结论/, "scope-correction purge must remain");
  assert.match(skill, /`research object` 必须锚定用户原话中的短语，或一个已检查的具体本地实体\/路径/, "anchoring guidance must remain");
  assert.match(skill, /凡是不在锚定对象覆盖范围内的内容，默认排除/, "default exclusion must remain");
  assert.match(skill, /打印 `\.env` \/ secret 值/, "no-secrets rule must remain");

  const clearComparison = fixtureById(fixtures, 15);
  assert.equal(clearComparison.expected_tools.length, 0, "clear interactive comparison must not search before confirmation");
  assert.match(clearComparison.expected_mode, /DRAFT contract shown/);

  const narrow = fixtureById(fixtures, 16);
  assert.equal(narrow.expected_mode, "NARROW_SELFCHECK", "narrow source exception must remain");

  const headless = fixtureById(fixtures, 17);
  assert.match(headless.expected_mode, /CONTRACT_ACCEPTED/, "complete pre-approved headless contract may proceed");

  const regression = fixtureById(fixtures, 20);
  assert.equal(regression.prompt, "本来在聊这个事情，就是文档 gov 怎么保证正确读取文档");
  assert.equal(regression.expected_tools.length, 0, "restatement regression must not route external tools");
  assert.match(regression.expected_mode, /wait for explicit confirmation/);
  assert(hasCriterion(regression, "Does not construct a query"), "restatement regression must prohibit query construction");

  console.log("OK: Search Contract gate regression checks passed (offline; no external calls)");
}

main().catch((error) => {
  console.error(`FAIL: ${error.stack || error.message}`);
  process.exitCode = 1;
});
