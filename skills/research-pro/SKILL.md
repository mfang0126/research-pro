---
name: research-pro
description: |
  系统化研究 skill — 螺旋收敛模型。把任何问题（模糊或清晰）分解成子问题，迭代搜索，越搜越清晰，直到每个子问题都有答案。

  Triggers: "帮我研究", "研究一下", "调研", "分析对比", "research", "investigate", "look up"
  也触发: 竞品分析、市场调研、技术选型对比、趋势了解
  Setup triggers: "安装 research-pro", "配置 research-pro", "research-pro doctor", "setup research-pro", "research-pro 未就绪"

  **Gates:** 开始外部搜索前必须通过 READY doctor 与 Search Target Confirmation Gate；所有交互式多源/外部研究必须先展示 Search Contract 并收到用户明确确认。唯一例外是一个用户明确提供的 URL/文件、且只要求读取/提取/摘要、不作跨源比较或推断的 `NARROW_SELFCHECK`（见 SKILL Phase 1）。

  Does NOT trigger normal multi-source research:
  - 已经知道答案的简单事实问题
  - 用户直接给了 URL/文件、且只要读取/提取/摘要的，按 Step 1.2 的 `NARROW_SELFCHECK` 处理（不进入跨源 research）
  - 代码调试、写代码任务

  Output: 结构化研究报告（结论 + 子问题答案 + 来源 + 争议点 + 未解决缺口）

user-invocable: true
version: 3.17.1-mf
metadata:
  fork:
    origin: research-pro-v2
    maintainer: community
    version: v3.17.0-mf
    created: "2026-04-12"
    changes:
      - "v3.0.0-mf: 螺旋收敛模型，Research Map，线索评分，Critic/Reflection"
      - "v3.1.0-mf: Phase 1 加本地上下文检查 + 前提验证；启动时告知深度"
      - "v3.2.0-mf: 工具矩阵更新为实际可用工具（理论推断版）"
      - "v3.3.0-mf: 工具矩阵基于实测修正（第一轮）；移除不可用工具；补充 Tavily Research、YouTube 两步流程"
      - "v3.4.0-mf: 修复 XAI_API_KEY 变量名错误（原 X_AI）；更新 OPENROUTER_API_KEY；加入 Perplexity/sonar 实时搜索（替代 Grok）；Grok 无实时搜索能力"
      - "v3.5.0-mf: 集成 Grok Responses API（web_search + x_search）；模型必须用 grok-4 系列；x_search 可搜 X/Twitter 实时讨论"
      - "v3.6.0-mf: 信号路由规则（S1-S6）+ 工具覆盖检查；防止惰性只用 Tavily；强制多工具组合"
      - "v3.7.0-mf: Phase 5 自动日志（JSONL）+ 每 10 次频率复盘；跟踪工具使用率 vs 贡献率；支持手动复盘"
      - "v3.8.0-mf: 日志扩展完整字段：token 消耗（Grok/Perplexity 精确值）、费用、tool_calls 次数、sub_questions、direction_change、confidence；复盘加费用分析；phases 修正为 5"
      - "v3.9.0-mf: 工具局限表（9 条已知局限 + 应对策略）；数据来源：Grok API 文档 + Tavily 搜索 + 实测"
      - "v3.10.0-mf: Perplexity 降级为 fallback（引用幻觉 37%）；Grok web_search 升为实时搜索首选；信号 S2 更新"
      - "v3.11.0-mf: 结构化报告格式重构：YAML frontmatter（机器可读）、子问题统一表格、对比矩阵、来源清单集中管理、争议点对立展示、元数据表"
      - "v3.12.0-mf: generic credentials（process.env never-override + ~/.config/research-pro + host adapters）；doctor.mjs；去 openclaw 硬路径；SETUP multi-runtime"
      - "v3.13.0-mf: allowlist-only host env load；RESEARCH_PRO_TRUST_HOST_ENV；drop clawdbot；research.mjs（no stdout keys）；install.sh + env.example；security.md"
      - "v3.13.1-mf: 强制 READY 门闩 — doctor --require-ready、Phase 1.0 fail-closed、setup 卡模板、description setup 触发"
      - "v3.14.0-mf: 旁路搜索 trace（runs/<id>/calls.jsonl + optional raw）；默认 light 不挡搜索；smart-search 自动落盘；search_with_trace.sh"
      - "v3.15.0-mf: Search Target Confirmation Gate；Search Contract 锁定研究中心，interactive/headless/narrow 路径、状态机与纠偏清除规则，阻止相邻主题漂移"
      - "v3.15.1-mf: 交互式多源研究必须展示 Search Contract 并获明确确认；移除 accepted-selfcheck 旁路，澄清/重述不等于确认"
      - "v3.16.0-mf: 修复裸第三方 CLI（tvly/firecrawl 等）冷启动拿不到凭据 — 新增 run-with-creds.mjs 进程内注水 shim（secret 不进 stdout），工具矩阵改走 shim；Deep 深度加收敛前置（每子问题≥2独立来源 + 至少一轮反面/最强批评搜索）；query 返回 0 结果自动放宽重试一次"
      - "v3.17.0-mf: 增加 host-native web_search/web_extract bridge；标准化 data.web 结果并强制保存 raw evidence，避免直接 host 工具调用脱离 research trace/cache"
      - "v3.17.1-mf: 修复交互式提问可见性；Search Contract 与关键上下文必须放入 clarify.question，不能只显示无上下文的继续确认句"
  pattern: spiral-convergence
  phases: 5
  requires:
    env: []
    optional: ["TAVILY_API_KEY", "XAI_API_KEY", "OPENROUTER_API_KEY", "FIRECRAWL_API_KEY", "YOUTUBE_API_KEY", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]
  hermes:
    required_environment_variables: []
---

# Research Pro v3.17.0-mf（螺旋收敛模型）

**核心原则：** 不是"问清楚再搜"，是"边搜边搞清楚"。先看本地，再看网络。

**安装：** `SETUP.md` 或 `bash scripts/install.sh`。  
**凭据：** `scripts/lib/credentials.mjs`（never-override + allowlist）。通用 `~/.config/research-pro/.env`（`env.example`）。安全：`references/security.md`。
**⚠️ 裸第三方 CLI 必经 shim：** `tvly`/`firecrawl`/`youtube_transcript_api` 等只读 `process.env`，不会自动加载 `.env` 源 → 冷启动报 "No API key"。**必须**用 `node {baseDir}/scripts/run-with-creds.mjs <cmd> ...` 运行（进程内注水 env 再 exec，secret 不进 stdout）。Node 脚本（`grok_search.mjs`/`research.mjs`）已自注水，直接调。
**搜索 trace（debug/对比，默认开 light）：** 见下方「旁路搜索 Trace」。

## ⛔ READY 门闩（强制 — 任何人开始研究前）

**定义：**
- **script READY** = `doctor` 的 `ready/runnable == true`（至少一个 Tavily / XAI / OpenRouter 或已知搜索 CLI）
- **host READY** = 本 agent 本轮可用内置 `web_search` / `x_search` / 等价工具
- **READY** = script READY **或** host READY
- **tier**（仅展示）: `none` | `min` | `good` | `full`

**每次**研究请求（含 setup 触发）必须先执行：

```bash
node {baseDir}/scripts/doctor.mjs --require-ready --json
```

| 结果 | 动作 |
|------|------|
| exit 0 / `ready: true` | 记录 `tier` + `capabilities` → 继续 Phase 1 |
| exit 1 / `ready: false` 且 **无** host web 工具 | **停止所有外部搜索**；把 doctor 的 setup 卡原样给用户；等配置后再来 |
| exit 1 但 **有** host web 工具 | 可 READY=true，仅用 host 工具；在状态行注明 `script=degraded` |

**禁止：** 跳过 doctor 直接 `tvly` / `curl` / Grok / Firecrawl。  
**禁止：** 未 READY 时编造搜索结果。  
**禁止：** 为检查配置而 `cat` / 打印 `.env` 内容。

**READY 后先输出一行（再拆子问题）：**
```text
就绪：tier=min|good|full · script=yes|no · host_web=yes|no · caps: quick_search,realtime_web,...
```

### Setup 卡（doctor 已打印；agent 也可复述）

用户未就绪时只给可复制步骤，不展开长方法论：

```markdown
## research-pro 未就绪

需要至少一个搜索后端。

### 最快修复
mkdir -p ~/.config/research-pro && chmod 700 ~/.config/research-pro
cp {baseDir}/env.example ~/.config/research-pro/.env
# 编辑填入任意一个: TAVILY_API_KEY / XAI_API_KEY / OPENROUTER_API_KEY
chmod 600 ~/.config/research-pro/.env
node {baseDir}/scripts/doctor.mjs --require-ready

或: bash {baseDir}/scripts/install.sh
详见 SETUP.md
```

---

## 核心机制：研究地图（Research Map）

在整个研究过程中，在工作记忆中维护研究地图，每轮结束后**必须更新**。

```
研究地图
├── 原始问题: "..."
├── Search Contract: {decision, object, in_scope, out_of_scope, answer_shape, anchor_evidence, state}
├── 核心目标: "..."（一句话：最终要知道什么）
├── 当前假设: [对答案的初步猜测，每轮 Reflection 后更新]
├── 子问题列表:
│     - Q1: [问题] | 状态: 未知/部分/已知 | 置信度: 高/中/低
│     - Q2: ...
├── 已知事实: [每条必须带来源 URL 或本地路径]
├── 线索池:
│     - {描述, 来源, 相关性分 0-3, 已追/未追}
└── 搜索轮次: N / 上限: M
```

研究地图是思考过程的载体，不是最终输出。

---

## Phase 1：理解问题 + 搜索目标确认

**目标：** 验证问题前提，拆成 2-4 个可以独立回答的子问题。

### Step 1.0：READY 门闩（强制，先于一切外部搜索）

```bash
node {baseDir}/scripts/doctor.mjs --require-ready --json
```

1. 解析 JSON：`ready`, `tier`, `capabilities`, missing keys（**不要**打印 secret）
2. 判定 READY（script **或** host web）
3. 未 READY → setup 卡 → **return**（不做 1.1+ 的网络搜索）
4. 已 READY → 输出就绪状态行 → **init trace** → Step 1.1（本地检查后必须过 Search Target Confirmation Gate）

**Trace init（READY 后立刻，失败不阻塞）：**
```bash
TRACE=$(node {baseDir}/scripts/trace.mjs init --question "原始问题摘要" --depth standard --tier min|good|full)
# stdout JSON: {run_id, run_dir, mode}
export RESEARCH_PRO_RUN_ID=$(node -e "let d='';process.stdin.read()||'{}';try{d=JSON.parse(d)}catch(e){d={}};process.stdout.write(d.run_id||'')" <<<"$TRACE")
```
状态行可附带 `run_id=...`。`RESEARCH_PRO_TRACE=off` 时 init 返回 skipped。

### Step 1.0b：Host-native retrieval bridge（强制）

`web_search` / `web_extract` 这类 host-native 工具调用不会被 Python `smart-search` 自动拦截；直接调用会导致研究结果出现在聊天里，但不进入 `calls.jsonl`、cross-run cache 或 raw evidence。**研究流程中禁止直接调用 host-native web 工具。**

必须在 `execute_code` 中运行：

```python
import runpy, sys, os
from pathlib import Path

# Resolve skill dir: Hermes uses {baseDir}; adjust if installed elsewhere
BASE = Path(os.environ.get("RESEARCH_PRO_SKILL_DIR",
    os.path.expanduser("~/.hermes/external-skills/research-pro")))
bridge = BASE / "scripts" / "host_native_trace.py"
sys.argv = [str(bridge), "search", "--query", "QUERY", "--hint", "quick"]
runpy.run_path(str(bridge), run_name="__main__")
```

已知 URL 的正文提取：

```python
import runpy, sys, os
from pathlib import Path

BASE = Path(os.environ.get("RESEARCH_PRO_SKILL_DIR",
    os.path.expanduser("~/.hermes/external-skills/research-pro")))
bridge = BASE / "scripts" / "host_native_trace.py"
sys.argv = [str(bridge), "extract", "--urls", "https://example.com/page", "--hint", "scrape"]
runpy.run_path(str(bridge), run_name="__main__")
```

Bridge 会：
- 把 Hermes `data.web` 标准化为 trace/cache 可识别的 `results[]`；
- 保留 native response、标题、URL、描述或正文；
- 强制写入 `raw/<call_id>.json`，即使 `RESEARCH_PRO_TRACE=light`；
- 写入 `calls.jsonl` 和 `search-cache.jsonl` 后才把原始结果输出给研究流程；
- 不打印凭据；raw 写入仍受 `RESEARCH_PRO_TRACE_MAX_RAW_BYTES` 限制。

`x_search`、Grok、Tavily、Firecrawl 等优先走 `smart-search` / `search_with_trace.sh`。如果确实必须直接调用 host-native `x_search`，必须先把完整 JSON 保存到文件，再执行：

```bash
node {baseDir}/scripts/trace.mjs record-search \
  --run-id "$RESEARCH_PRO_RUN_ID" \
  --file /path/to/native-result.json \
  --hint social \
  --actual-tool x_search \
  --requested-tool host-native-x-search \
  --source host-native-manual \
  --force-raw
```

禁止只记录“搜过了”或只记录摘要；没有 URL、结果列表和 raw response 的记录只能标为 metadata-only，不得作为 reference-supported 证据使用。

### Step 1.1：本地上下文检查（先做，再拆问题）

在搜索任何东西之前，先检查本地：

- **问题涉及"我们的"或"当前"系统/项目** → 先读相关文件（配置、代码、文档）
- **问题是关于某工具/库是否存在或已集成** → 先检查 `package.json`、配置文件、`extensions/`、`plugins/`
- **问题涉及某个决策或现状** → 先查 `shared/docs/`、`DECISIONS.md`、`PROJECTS.md`

**本地检查结果决定下一步：**
- 发现问题前提错误（如"要不要集成X" → X 已经集成了）→ 立即触发 Phase 4 方向转变，问用户
- 发现有用的上下文 → 加入研究地图"已知事实"，跳过对应子问题的外部搜索
- 没有相关本地信息 → 继续 Step 1.2

### Step 1.2：Search Target Confirmation Gate（强制；先于 Phase 2、query、工具路由与任何外部搜索）

**目的：** Gate 锁定研究的**中心**（WHAT：对象、边界、决策）；螺旋收敛探索该中心内的**半径**（HOW：子问题、证据与细节）。不要把应由研究发现的内容细节拿来反复澄清。

先写紧凑的 `Search Contract`（中文；用户为其他语言时用其语言）。`research object` 必须锚定用户原话中的短语，或一个已检查的具体本地实体/路径；`anchor_evidence` 记录该原话或路径。凡是不在锚定对象覆盖范围内的内容，默认排除，不能靠无限枚举 adjacent interpretations。

```markdown
## Search Contract
- decision/question: [要支持的决策或要回答的问题]
- research object: [锚定对象；不改写成相邻主题]
- in scope: [要比较/验证的边界]
- out of scope: [明确排除的相邻解释；其他未被 object 覆盖者默认排除]
- answer shape: [结论、比较、证据或可执行建议]
- anchor_evidence: [用户原话「…」或已检查的本地路径：…]
```

**状态机（硬规则）：** 对所有交互式多源/外部研究，唯一流程是 `DRAFT` → `CONTRACT_ACCEPTED` → `SEARCHING`。必须先把 `DRAFT` contract 展示给用户；只有用户**明确确认该已展示的 contract** 后才能设为 `CONTRACT_ACCEPTED`，再进入 `SEARCHING`。`DRAFT` 状态不得构造 query、选/路由工具、调用 web/API/CLI 搜索或启动外部 research。

1. **交互式多源/外部研究（无论请求看起来多清楚）：** 展示上述 contract；只问一个确认/纠正问题，并等待后续消息。用户明确确认显示的 contract 后才设为 `CONTRACT_ACCEPTED`。可先做 doctor 与本地文件检查，禁止外部搜索。
2. **确认的判定（硬规则）：** 只有用户对**已展示的 contract**作出无歧义的批准才是确认（例如「确认，按这个范围研究」）。用户只是重述、补充、澄清或换一种说法描述主题，**不是** contract confirmation；必须用该信息更新/重写 `DRAFT` contract、再次展示，并等待用户确认或纠正。不得用内部自检、清晰度判断或 `accepted-selfcheck` 替代用户确认。

**可见提问硬规则（Telegram/消息平台尤其重要）：**
- `clarify` 的 `question` 参数必须包含完整的、紧凑的 Search Contract（`decision/question`、`research object`、`in scope`、`out of scope`、`answer shape`、`anchor_evidence`）以及明确的“请确认/纠正”请求。不能只把 Contract 放在此前的 assistant prose，随后调用 `clarify(question="是否继续？", ...)`；消息平台可能只把 clarify 这一条作为可操作提问显示给用户。
- 不得只写“是否继续”或“是否按以上范围”这类没有上下文的问题。用户看到提问时必须能知道：研究什么、范围是什么、排除什么、要回答什么。
- `choices` 只能放短的确认标签，不能成为唯一的范围说明。长内容放 `question`；choices 例如 `["确认：按以上 Search Contract 研究"]`。
- 推荐模板：

```python
clarify(
    question="""Search Contract
- decision/question: ...
- research object: ...
- in scope: ...
- out of scope: ...
- answer shape: ...
- anchor_evidence: ...

请确认以上范围；如需调整请直接指出。""",
    choices=["确认：按以上范围研究"],
)
```

- 同一规则适用于方向转变或重大决策提问：`question` 必须包含触发发现、影响和可选路径，不得只写“是否调整方向？”。

3. **狭窄单一来源读取（唯一窄例外）：** 仅当用户给出**一个**明确 URL/文件，并且只要求读取、提取或摘要其内容、没有跨源比较、评估、补充背景或推断时，才可做轻量自检（URL/路径、所要输出、无跨源推断）并标为 `NARROW_SELFCHECK`，直接进行该单一来源读取；这不是多源 research，也不进入 `SEARCHING`。任一条件不满足即回到完整交互式 contract 流程。
4. **Headless Kanban/cron：** 仅当任务正文已有可机器检查的预批准字段才可设为 `CONTRACT_ACCEPTED`：`decision`、锚定的 `object`、`in_scope`、`out_of_scope`、`answer_shape`、`anchor_evidence`。任一缺失、object 未锚定或字段互相冲突 → 在任务评论写 DRAFT contract，`needs_input` block；绝不静默扩展范围。

**收到用户纠正：** 立即把 state 退回 `DRAFT`，删除旧方向的子问题、query seeds、计划工具、URL、发现和候选结论；从更正后的 contract 重建 Research Map，**展示它并等待新的明确确认**。被拒方向的结果不得作为相关证据报告。

**精确失败示例：**
- ✅ 用户问「agent-governance 的上下文路由该怎么设计？」 → object 锚定「agent-governance 的上下文路由」；研究 agent context routing、边界与治理决策。
- ❌ 不得把上述 object 扩展为「CI/CD、GitHub Actions 或部署治理」并搜索；这些是相邻但默认排除的主题，除非用户明确加入 scope。

### Step 1.3：拆子问题并重建 Research Map（仅在 contract 允许进入 SEARCHING 后）

1. 提炼**核心目标**（一句话）
2. 写下**当前假设**（哪怕是错的）
3. 拆出 2-4 个子问题

**⛔ Gate：**
- 每个子问题必须能独立回答
- 所有子问题合起来必须覆盖 contract 的核心目标，且不得越出 `in scope`

### Step 1.4：告知用户/记录状态

Phase 1 结束时输出一行：
```
合同：accepted（anchor：[短语/路径]）| 深度：[Quick/Standard/Deep]（最多 N 轮）| 子问题：Q1, Q2, Q3 | 如需调整范围或深度请说明
```

---

## Phase 2：搜索准备

**目标：** 为每个"未知"或"部分"子问题构建 query，选工具。

**前置断言：** 多源/外部 research 的 `Search Contract.state` 必须为 `CONTRACT_ACCEPTED`，且该状态必须来自用户对已展示 contract 的明确确认（headless 仅限任务正文的完整预批准 contract）。否则停止：不构建 query、不路由工具、不进行任何外部搜索。`NARROW_SELFCHECK` 只能读取其唯一的用户提供来源，绝不进入 Phase 2。

1. 每个子问题提取 **2-3 个 keyword 组合**
2. 对每个子问题过一遍**信号路由规则**（见下方），确定工具组合
3. 执行**工具覆盖检查**
4. 按"对核心目标的影响"排优先级

**Keyword 构建原则：**
- 用具体名词，不用动词短语（"React RSC limitations 2025" 好过 "what are the problems with RSC"）
- 一个宽泛版本 + 一个具体版本
- 技术问题加版本号或年份

### 信号路由规则（必须逐条过）

对每个子问题，按顺序检查以下信号。匹配到的工具**必须加入**该子问题的工具组合（不是二选一，是叠加）：

| # | 信号 | 触发条件 | 必须加入的工具 |
|---|------|---------|---------------|
| S1 | 社区情绪 | 问题涉及"开发者怎么看"、"社区反馈"、"用户体验"、产品口碑 | Grok x_search + Tavily site:reddit.com |
| S2 | 实时性 | 问题涉及"最新"、"最近"、"2026"、"本周"、新闻、发布 | Grok web_search（引用可靠）；Grok 不可用时 fallback Tavily |
| S3 | 深度对比 | 问题是 A vs B、技术选型、竞品分析 | Tavily Research + 至少一个实时工具（S2） |
| S4 | 教程/How-to | 问题涉及"怎么做"、实现方式、代码示例 | Tavily search + YouTube（可能有视频教程） |
| S5 | 市场/热度 | 问题涉及"有多少人用"、"趋势"、"市场份额" | DataForSEO + Grok x_search |
| S6 | 单一权威源 | 已知某个 URL 有关键信息 | Firecrawl scrape（非 Reddit）/ Tavily extract（Reddit） |

**没有匹配任何信号？** → 默认 Tavily search。

### 工具覆盖检查（⛔ 强制）

选完工具后，必须回答这个问题：

> "这组子问题里，有没有哪个维度只用了 Tavily？如果是，有没有第二个工具能提供**不同视角**的信息？"

- 如果所有子问题都只用 Tavily → **至少给一个子问题加一个非 Tavily 工具**
- 每次研究至少使用 **2 种不同的工具**（Tavily 算一种）

**工具选择矩阵（基于实测 2026-04-12）：**
| 问题类型 | 时效 | 首选工具 | 命令 | 备用 |
|---------|------|---------|------|------|
| 通用技术搜索 | 不限 | Tavily | `tvly search "query"` | Firecrawl search |
| 深度综合报告 | 不限 | Tavily Research | `tvly research "query"` | — |
| 最新动态/实时 | 实时 | Grok web_search | Responses API `/v1/responses` | Tavily |
| 社区/Reddit 讨论 | 近期 | Tavily site filter | `tvly search "query site:reddit.com"` | WebSearch |
| 深挖单页（普通） | 不限 | Firecrawl scrape | `firecrawl scrape "URL"` | Tavily extract |
| 深挖单页（Reddit） | 不限 | Tavily extract | `tvly extract "URL"` | WebFetch |
| 视频内容 | 不限 | YouTube API + Transcript | 见下方两步流程 | — |
| 关键词热度/SERP | 不限 | DataForSEO | REST API | — |
| 复杂推理 + 实时搜索 | 实时 | Grok web_search | Responses API `/v1/responses` | Tavily Research |
| X/Twitter 实时讨论 | 实时 | Grok x_search | Responses API `/v1/responses` | Tavily site:x.com |
| Grok 不可用时的 fallback | 实时 | Perplexity sonar | OpenRouter REST API（⚠️ 引用幻觉 37%） | Tavily |

> 表内 `tvly`/`firecrawl` 等命令均为简写；实际执行**必须**前缀 `node {baseDir}/scripts/run-with-creds.mjs`（见上方「调用方式」的 shim 规则），否则拿不到凭据。

**已知局限（选工具时必须考虑）：**
| 工具 | 局限 | 应对 |
|------|------|------|
| Tavily search | 结果偏 SEO 优化内容，深度不够；JS 重度渲染页可能抓不全 | 深度内容用 Firecrawl scrape 或 Tavily Research |
| Tavily Research | ~42s 慢；结果是 AI 综合的，可能丢原始细节 | 需要原始来源时用 search + extract 组合 |
| Tavily extract | 对复杂 JS SPA 页面效果差 | 换 Firecrawl scrape |
| Firecrawl | ❌ 无法抓 Reddit；Cloudflare 保护的站点可能被拦；付费墙内容抓不到 | Reddit → Tavily extract；被拦 → WebFetch |
| Grok x_search | ~50s 慢；日期过滤只支持 YYYY-MM-DD 精度到天；很老的帖子相关性下降 | 时效性强的问题优先用；历史讨论考虑 Tavily site:x.com |
| Grok web_search | ~50s 慢（Tavily 1.7s）；非英文内容覆盖可能不如 Tavily；$5/1000 calls | 中文搜索优先 Tavily；速度敏感的 Quick 模式考虑先 Tavily 再 Grok |
| Perplexity sonar | ⚠️ 回答准确率 >90%，但**引用幻觉率 37%**（CJR 2025 基准，1/3 的引用不匹配内容）；Sonar Pro 更差 45%。答案大概率对但来源可能对不上 | Critic 步骤**必须**用 Firecrawl/Tavily extract 验证关键引用 URL 是否真说了那些话 |
| YouTube | 不是所有视频有字幕；自动字幕质量参差；API quota 有限 | 检查 transcript 可用性再决定是否深挖 |
| DataForSEO | 中文关键词支持有限；数据有延迟（非实时） | 中文市场用 Grok x_search 补充 |

**调用方式：**
> ⚠️ 下面凡是裸 CLI（tvly/firecrawl/youtube_transcript_api）或用到 `$XXX_API_KEY` 的 curl，**都要经凭据 shim**，否则冷启动报 "No API key"。
> 令 `RWC = node {baseDir}/scripts/run-with-creds.mjs`（进程内注水 env 再 exec，secret 不进 stdout）。
```bash
# Tavily — 快速搜索（1.7s）
RWC tvly search "query"
RWC tvly extract "https://url"

# Tavily — 深度综合报告（~42s，自动整合多源）
RWC tvly research "query"

# Perplexity via OpenRouter — real-time search (credentials managed by the credentials shim)
# sonar: quick search; sonar-pro: deeper with citations. Use the search tool's built-in Perplexity support.
RWC echo "Use the built-in search tool with hint=official for Perplexity-powered search"

# Firecrawl — 深挖单页完整内容（不支持 Reddit）
RWC firecrawl search "query" --limit 10
RWC firecrawl scrape "https://url"

# YouTube — 两步流程：先找视频，再提取字幕
# Step 1: YouTube Data API（YOUTUBE_API_KEY；兼容旧名 YOUTUBE_API）→ 经 shim：
RWC Run search via the built-in search toolrch?part=snippet&q=QUERY&type=video&maxResults=5&key=$YOUTUBE_API_KEY"'
# Step 2: 提取字幕（无需额外 key）
RWC youtube_transcript_api "VIDEO_ID" --format text

# DataForSEO — 关键词搜索量 + SERP 结构分析
# 使用 DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars
# REST API: https://api.dataforseo.com/v3/serp/google/organic/live/advanced

# Grok web_search — 实时网页搜索，带引用（~50s，返回带 URL 引用的结构化回答）
# 必须用 grok-4 系列模型（grok-3 不支持 server-side tools）
# Prefer: node {baseDir}/scripts/grok_search.mjs "QUERY" --web --json
curl -s https://api.x.ai/v1/responses \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-4","tools":[{"type":"web_search"}],"input":"QUERY","max_output_tokens":500}'

# Grok x_search — X/Twitter 实时讨论搜索
# Prefer: node {baseDir}/scripts/grok_search.mjs "QUERY" --x --json
curl -s https://api.x.ai/v1/responses \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-4","tools":[{"type":"x_search"}],"input":"QUERY","max_output_tokens":500}'

# Grok web_search + x_search 同时使用（网页 + X/Twitter 双搜）
curl -s https://api.x.ai/v1/responses \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-4","tools":[{"type":"web_search"},{"type":"x_search"}],"input":"QUERY","max_output_tokens":500}'

# 解析 Grok 响应：输出文本在 output[].content[].text（type=message 的元素里）
# 引用在 output[].content[].annotations[]（type=url_citation）
# 计费: $5 / 1000 tool calls（单独计费）
# Credentials: scripts auto-load via lib/credentials.mjs — do NOT hardcode source ~/.openclaw/.env
```

**⛔ Gate：** 每个子问题有至少 2 个 keyword 组合才能开始搜索。

---

## Phase 3：搜索 + 地图更新（循环核心）

**目标：** 执行搜索，更新研究地图，发现并评分新线索。

**步骤：**

1. **并行发起**所有未知子问题的搜索
2. **旁路记录每次搜索**（不进聊天上下文；失败忽略）
   - **首选 smart-search**：已 export `RESEARCH_PRO_RUN_ID` 时自动写 `calls.jsonl`
   - 或包装：`{baseDir}/scripts/search_with_trace.sh --query "..." --hint quick --sub-q Q1 --round 1`
   - 直连第三方 CLI / curl：先用 `node {baseDir}/scripts/trace.mjs lookup-search` 做 exact cache lookup；只有 miss/stale 才调用 backend，结果 JSON 落盘后用 `node {baseDir}/scripts/trace.mjs record-search --file /tmp/r.json --source host-native --sub-q Q1 --round 1 --force-raw`。
   - host-native `web_search` / `web_extract`：**必须**通过 Step 1.0b 的 `host_native_trace.py` bridge；不要直接调用后再补记，因为 `data.web` 需要标准化且 raw 必须在输出前落盘。
   - `x_search` 等没有 bridge 的 host tool：把完整 JSON 保存后用上面的 `record-search --file ... --force-raw`；（委托 worker 使用 `--source delegated`）。
3. 对每条结果：
   - 提取事实 → 加入已知事实（**必须带来源 URL**）
   - 更新子问题状态
4. 扫描结果中的新线索，打分：

**线索评分：**
| 分 | 标准 | 动作 |
|----|------|------|
| 3 | 直接回答子问题，或根本改变核心目标理解 | 立即追 |
| 2 | 与核心目标相关，但是支线 | 加入线索池，本轮后追 |
| 1 | 边缘相关，不影响核心目标 | 记录但不追 |
| 0 | 不相关或重复 | 忽略 |

**Critic（每轮必做）：**
- 已知事实中有矛盾吗？→ 标记为争议点
- 关键来源 URL 是真实可访问的吗？
- 给每条关键事实打 Evidence Strength（强/中/弱）

**Reflection（每轮必做，1-2 句）：**
> "本轮最重要的新发现是什么？哪个假设被推翻或加强？下一轮优先追什么？"

更新研究地图中的"当前假设"。

**自我校准规则：**
- 已知事实越多 → 1 分线索阈值自动提高（更严格）
- 某方向连续 2 轮无新发现 → 降低优先级，换方向
- 新线索与已有假设矛盾 → 自动升为 3 分，优先追

**Token 管理：**
- 每 3 轮：summarize 已知事实为要点列表，清理 0-1 分线索

---

## Phase 4：收敛判断

每轮 Phase 3 完成后（或 Phase 1 检查发现重大问题时）执行：

**1. 方向转变检查（最优先）**
- 发现问题前提错误，或本轮发现根本改变了核心目标？
- 是 → 暂停，告诉用户具体发现了什么，问是否调整方向
- 否 → 继续

**2. 覆盖检查**
- 所有子问题状态都是"已知"？→ 进入输出（Deep 深度需先过下方收敛前置）
- 还有"未知" + 线索池有 3 分线索？→ 回 Phase 3 继续
- 还有"未知"但线索池空了？→ 回 Phase 2 重新构建 keyword

**2b. Deep 收敛前置（仅 Deep 深度；不满足不得进入输出）**
- 每个子问题 **≥2 个独立来源**（同一来源/镜像不算两个）。
- 至少完成**一轮专门的反面/最强批评搜索**（adversarial）：主动搜"X 的问题/批评/失败/坑/vs 替代品"，避免只收集印证性证据。
- 未满足 → 回 Phase 2/3 补这一轮；Quick/Standard 不强制，但鼓励反面搜索。
- 说明：Deep 是**轮次上限（ceiling）**不是下限，提前覆盖可停；但"提前"必须先过本前置，否则"Deep"名不副实。

**3. 轮次上限**
- Quick: 2 轮 | Standard: 5 轮 | Deep: 10 轮
- 达到上限未完全覆盖 → 输出"部分结果"，说明缺口

---

## Phase 5：日志 + 自我优化

### Step 5.1：自动日志（每次研究结束后必做）

**A. Finalize per-run trace（优先）：**
```bash
node {baseDir}/scripts/trace.mjs finalize \
  --run-id "$RESEARCH_PRO_RUN_ID" \
  --confidence high \
  --summary "一句话结论" \
  --tools-used tavily,grok_web \
  --tools-contributed tavily \
  --report-file /path/to/report.md   # optional
# 同时写入 $RESEARCH_PRO_HOME/run-log.jsonl 一行摘要
```

**B. 兼容：手动 append 一行 JSONL（若无 run_id）：**

```bash
RESEARCH_PRO_HOME="${RESEARCH_PRO_HOME:-$HOME/.config/research-pro}"
mkdir -p "$RESEARCH_PRO_HOME"
echo '{...}' >> "$RESEARCH_PRO_HOME/run-log.jsonl"
```

可选清理（不阻塞）：`node {baseDir}/scripts/trace.mjs prune --days 14`

**JSONL 字段（完整）：**

```jsonc
{
  // 基础
  "ts": "2026-04-13",
  "question": "简短问题摘要",
  "depth": "standard",
  "rounds": 3,
  "sub_questions": 3,
  "direction_change": false,
  "confidence": "high",

  // 工具追踪
  "tools_used": ["tavily", "grok_x", "perplexity"],
  "tools_contributed": ["tavily", "grok_x"],
  "tools_planned_not_used": ["youtube"],
  "tool_calls": {"tavily": 4, "grok_x": 1, "perplexity": 1},
  "signals_matched": ["S1", "S3"],

  // 质量
  "citations": 22,
  "gaps": 0,

  // Token & 费用（从 API 响应中提取）
  "tokens": {
    "grok": {"in": 4312, "out": 1696, "calls": 1},
    "perplexity": {"in": 850, "out": 420, "calls": 1},
    "tavily": {"calls": 4},
    "firecrawl": {"calls": 0},
    "youtube": {"calls": 0},
    "dataforseo": {"calls": 0}
  },
  "cost_usd": {
    "grok": 0.035,
    "perplexity": 0.002,
    "tavily": 0,
    "total": 0.037
  }
}
```

**Token 数据提取方式：**

```bash
# Grok — 响应自带（精确）
# response.usage.input_tokens / output_tokens / cost_in_usd_ticks
# cost_in_usd_ticks 除以 1,000,000,000 = USD

# Perplexity via OpenRouter — 响应自带（精确）
# response.usage.prompt_tokens / completion_tokens

# Tavily / Firecrawl / YouTube / DataForSEO — 只记调用次数
```

**字段说明：**
- `tools_used`: 实际调用了的工具
- `tools_contributed`: 结果进入了最终报告的工具（关键指标）
- `tools_planned_not_used`: 计划用但没用的（信号误匹配）
- `tool_calls`: 每个工具调了几次（不只是用/没用）
- `signals_matched`: 触发了哪些 S1-S6 信号
- `sub_questions`: 拆了几个子问题
- `direction_change`: 是否触发了方向转变（Phase 4.1）
- `confidence`: 最终结论的整体置信度
- `tokens`: 每个 API 工具的精确 token 消耗
- `cost_usd`: 换算成美元的费用（grok 从 cost_in_usd_ticks 算，perplexity 按费率算）
- `gaps`: 未解决缺口数量

### Step 5.2：阈值复盘（每 10 次自动触发）

Phase 1 开始前，检查日志行数：

```bash
RESEARCH_PRO_HOME="${RESEARCH_PRO_HOME:-$HOME/.config/research-pro}"
wc -l < "$RESEARCH_PRO_HOME/run-log.jsonl" 2>/dev/null || echo 0
```

如果行数是 **10 的倍数且 > 0**，在 Phase 1 之前输出复盘：

**复盘必须回答这 5 个问题：**

1. **工具效率**：每个工具的使用率 vs 贡献率是多少？
   - 使用率高但贡献率低 → 该工具被过度使用
   - 使用率低但贡献率高 → 信号路由太窄，应扩大触发条件
2. **信号准确度**：哪些信号经常触发但工具没贡献？→ 信号条件需收紧
3. **工具盲区**：有没有哪种问题类型总是只用 Tavily？→ 覆盖检查没起作用
4. **缺口趋势**：gaps 数量是在减少还是增加？→ 整体质量趋势
5. **Token & 费用**：总 token 消耗和费用趋势，哪个工具性价比最低？

复盘格式：
```
📊 research-pro 复盘（过去 10 次）
工具效率：
  - tavily: 10/10 用 → 8/10 贡献 (80%) ✅ 主力稳定
  - grok_x: 3/10 用 → 3/3 贡献 (100%) ⚠️ 命中率高但触发太少
  - youtube: 2/10 用 → 0/2 贡献 (0%) ⚠️ 考虑降优先级
信号调整建议：
  - S1 扩大触发词（加入"争议"、"吐槽"）
  - S4 对 YouTube 改为可选而非默认
Token & 费用：
  - 总计: ~58K tokens, $0.42
  - 平均/次: ~5.8K tokens, $0.042
  - grok: 15K tokens ($0.35) — 占总费用 83%，但贡献了 40% 关键发现
  - perplexity: 8K tokens ($0.07) — 性价比高
整体：gaps 平均 0.3/次 → 质量良好
```

复盘只输出，不阻塞研究流程。

---

## 调用方式

**用户直接调用：**
```
"帮我研究 [主题]"  →  自动进入 Phase 1
深度默认 Standard（5轮）
```

**Agent 结构化调用：**
```json
{
  "question": "...",
  "depth": "quick|standard|deep",
  "context": "已知背景，跳过部分 Phase 1"
}
```

**复盘调用（随时可用）：**
```
"复盘 research-pro" 或 "research-pro review"
→ 读 run-log.jsonl，输出复盘分析（不需要凑够 10 次）
```

---

## 输出格式

Phase 1 结束时先输出一行状态：
```
合同：accepted（anchor：[短语/路径]）| 深度：Standard（最多5轮）| 子问题：Q1, Q2, Q3 | 如需调整范围或深度请说明
```

最终报告格式：

```markdown
---
type: research-report
question: "原始问题"
search_contract_state: CONTRACT_ACCEPTED|NARROW_SELFCHECK
search_contract_anchor: "用户原话短语或本地路径"
core_goal: "一句话核心目标"
depth: standard
rounds: 2
tools: [tavily, grok_web, grok_x]
signals: [S1, S2, S3]
confidence: high
date: YYYY-MM-DD
---

# [核心目标一句话]

> **结论：** 1-3 句直接回答。

## 发现

### Q1: [子问题]
| 维度 | 内容 |
|------|------|
| 答案 | ... |
| 置信度 | 高/中/低 |
| 证据强度 | 强/中/弱 |
| 关键来源 | [名称](URL), [名称](URL) |

### Q2: [子问题]
（同样表格格式，每个子问题结构统一）

## 对比矩阵
（如果是比较类问题，用表格并排展示差异）
| 维度 | A | B | C |
|------|---|---|---|
| ... | ... | ... | ... |

## 争议点
| 观点 A | 观点 B | 来源 |
|--------|--------|------|
| [主张] | [反面主张] | [URL] vs [URL] |

## 来源清单
| # | 来源 | 类型 | 证据强度 | 贡献 |
|---|------|------|---------|------|
| 1 | [title](URL) | 博客/论文/Reddit/X | 强/中/弱 | Q1, Q2 |
| 2 | ... | ... | ... | ... |

## 缺口
- [ ] 未解决的部分（如有，无则省略此节）

## 元数据
| 指标 | 值 |
|------|-----|
| 轮次 | N |
| 来源数 | M |
| 工具 | Tavily ×N, Grok web ×N, ... |
| Grok tokens | in: Nk, out: Nk |
| 费用 | $X.XX |
```

**格式规则：**
- YAML frontmatter 必须包含，让其他 agent 可以 parse
- 每个子问题**必须**用相同的表格结构（答案、置信度、证据强度、来源）
- 比较类问题**必须**有对比矩阵
- 来源清单集中管理，每条标注类型和证据强度
- 争议点用表格对立展示，不用叙述体
- 无争议/无缺口时省略对应 section

---

## 执行铁律

禁止：
- ❌ 跳过 READY 门闩（doctor）直接外部搜索
- ❌ 未 READY 时编造搜索结果
- ❌ 跳过 Phase 1 的本地上下文检查直接搜索
- ❌ 未经展示的 Search Contract 获用户明确确认，就构建 query、路由工具或进行任何多源/外部搜索
- ❌ 把用户对主题的重述、补充或澄清当作 contract confirmation
- ❌ 使用 `accepted-selfcheck` 或任何内部清晰度判断绕过交互式确认
- ❌ 把锚定研究对象静默扩展为相邻主题
- ❌ 在用户纠正 scope 后保留旧方向的子问题、queries、URL 或发现作为相关证据
- ❌ 发现问题前提错误还继续执行
- ❌ 搜完不更新研究地图
- ❌ 引用没有来源 URL 的"事实"
- ❌ 跳过 Reflection 步骤
- ❌ 为配置检查打印 `.env` / secret 值

必须：
- ✅ Phase 1.0 doctor `--require-ready`（或等价 JSON + 自行 fail-closed）
- ✅ 未 READY 输出 setup 卡并停止搜索
- ✅ READY 后先打状态行再拆问题
- ✅ Phase 1 先查本地，再查网络
- ✅ 多源/外部研究先展示 Search Contract；只有用户明确确认后的 `CONTRACT_ACCEPTED` 才能进入 Phase 2
- ✅ `NARROW_SELFCHECK` 仅限一个用户提供 URL/文件的读取、提取或摘要；不得进入 Phase 2 或扩展为跨源研究
- ✅ object 以用户原话或具体本地实体/路径锚定，并记录 `anchor_evidence`
- ✅ headless 仅接受含 6 个可检查字段的预批准 contract；否则评论 DRAFT + `needs_input` block
- ✅ Phase 1 结束后告知用户深度和子问题
- ✅ 每轮结束更新研究地图
- ✅ 每轮做 Critic + Reflection
- ✅ 所有事实带来源
- ✅ 方向大变时问用户
- ✅ 研究结束后写日志（Phase 5 finalize + run-log）
- ✅ READY 后 init search trace（除非 TRACE=off）
- ✅ 每次外部搜索旁路记录（smart-search 自动；直连用 trace record-search）
- ✅ 每 10 次自动输出复盘

---

## 旁路搜索 Trace（debug / 对比，默认 light）

**目的：** 保留每次搜索结果供 checking / debugging / backend 对比。**不进对话上下文，不挡搜索。**

| Env | 默认 | 含义 |
|-----|------|------|
| `RESEARCH_PRO_TRACE` | `light` | `off` 关闭 / `light` 只记摘要+top urls / `full` 另存 raw JSON（截断） |
| `RESEARCH_PRO_RUN_ID` | — | 当前 run；init 后 export |
| `RESEARCH_PRO_HOME` | `~/.config/research-pro` | 根目录 |
| `RESEARCH_PRO_TRACE_TOP_N` | `10` | light 保留 url 数 |
| `RESEARCH_PRO_TRACE_MAX_RAW_BYTES` | `200000` | full raw 上限 |

**目录：**
```text
$RESEARCH_PRO_HOME/runs/<run_id>/
  run.json          # 问题、depth、status、tool 计数
  calls.jsonl       # 每次搜索 1 行
  raw/<call_id>.json  # 仅 full 模式
  report.md         # finalize 时可选
current-run.json    # 最近 run 指针
run-log.jsonl       # 跨 run 摘要（兼容旧 Phase 5）
```

**calls.jsonl 字段：** `ts, run_id, call_id, query, hint, requested_tool, actual_tool, degraded, elapsed_ms, result_count, status, error, urls_top[], raw_path, sub_q, round, source`

**CLI：**
```bash
node {baseDir}/scripts/trace.mjs init|append|record-search|lookup-search|finalize|prune|status
node {baseDir}/scripts/search_with_trace.sh --query "..." --hint quick
```

**规则：**
- 禁止把 raw 全文贴进聊天 / 最终报告（报告只引 URL）
- trace 写失败 → 忽略，继续研究
- 默认 14 天可 `prune`；不自动删除非显式调用

**搜索对比（可选任务）：** 同一 query 用不同 `--hint` 各跑一遍，读同一 `calls.jsonl` 比 `urls_top` / `degraded` / `elapsed_ms`。

## 搜索行为规则

1. **先理解再搜索：** 知道你要验证什么，再调用 smart-search
2. **分轮搜索：** 一次搜索很少够。检查缺口，调整 query，再搜
3. **降级结果 = 弱证据：** `degraded=true` 意味着结果不匹配请求的 hint 类型，不能当强证据用
4. **优先本地上下文：** 问题涉及当前 repo/config/状态时，先读本地文件再搜外部
5. **保留证据：** 最终回答必须引用 source_type、URL、以及任何降级信息
6. **从日志优化：** 检查 `$RESEARCH_PRO_HOME/runs/<id>/calls.jsonl` 与 `run-log.jsonl`；smart-search 全局 log 仍在 `~/.hermes/logs/smart-search.jsonl`（仅 Hermes 平台）
7. **0 结果自动放宽：** 某次搜索返回 0 结果 → **不要直接判定"无信息"**；先自动放宽 query（去掉最具体的限定词/年份/长修饰，或换近义关键词）重试一次，仍 0 才记为空。过窄的长 query 是 0 结果的头号原因。

### 降级处理指南

当 smart-search 返回 `degraded: true` 时：
- `realtime` 降级 → 不要声称"最新"信息
- `social` 降级 → 不要声称"社区/X 上说"
- `scrape` 降级 → 不要声称"页面内容显示"
- **降级结果可以作为线索，但不能作为结论的唯一依据**

### 停止条件

什么时候停止搜索：
- 所有子问题状态都是"已知" → 停止
- 连续 2 轮没有新发现 → 换方向或停止
- 线索池清空 + 没有 3 分线索 → 停止
- 达到轮次上限（Quick 2 轮 / Standard 5 轮 / Deep 10 轮）→ 停止，输出部分结果

### 补搜条件

什么时候需要补搜：
- 某个子问题只有单一来源 → 需要第二个来源交叉验证
- Critic 发现矛盾 → 需要搜更多来源澄清
- 新线索评 3 分 → 立即追
- 某方向连续 2 轮无新发现 → 换 keyword 组合重搜

---

## Smart Search 速查

> smart-search 是纯工具层，research-pro 是方法论层。smart-search 不判断研究是否充分，research-pro 不指定固定 backend。

### 路由速查表

| 查询类型 | 最佳 hint | 降级 fallback | 原因 |
|---------|----------|-------------|------|
| 快速事实（EN） | `quick` | — | Tavily ~1.5s，稳定 |
| 快速事实（CN） | `quick` | — | Tavily 中文可用 |
| 实时新闻 | `realtime` | `quick`（降级!） | 只有 Grok 有实时搜索 |
| X/Twitter 讨论 | `social` | — | 只有 Grok x_search |
| 已知 URL | `scrape` | `quick`（降级!） | Firecrawl 完整抓取 |
| Reddit 讨论 | `community` | — | Tavily site:reddit.com |
| 深度报告 | `deep` | `official,community` | Tavily Research ~42s |
| 视频教程 | `video` | `quick` | YouTube Data API |
| SEO/关键词 | `serp` | `quick` | DataForSEO |

### Combo Hints 场景

| 场景 | Combo | 并行工具 |
|------|-------|---------|
| 值不值得集成 | `official,community,realtime` | 官方文档 + Reddit + 新闻 |
| 新技术调研 | `deep,realtime,community` | 深度报告 + 实时 + 社区 |
| 产品/市场分析 | `serp,social,community` | SEO + X/Twitter + Reddit |
| 教程 + 实操 | `quick,video,scrape` | 搜索 + 视频 + 页面抓取 |

### 成本/1K 查询

DataForSEO $0.30 < Grok $5 < Firecrawl $5.3 < Tavily $8

### 架构边界（⛔ 硬规则）

**smart-search 不做：**
- ❌ 不判断研究是否充分
- ❌ 不决定是否继续搜
- ❌ 不写研究策略

**research-pro 不做：**
- ❌ 不指定固定 backend（用 hint 表达意图，让 smart-search 路由）
- ❌ 不假设 smart-search 一定可用（smart-search 挂了，用 `tvly`/`curl` 直接搜）
