# Research Pro v3 实现差距审计

> 日期：2026-07-27  
> 审计对象：Research Pro `3.15.1-mf` 的当前本地规范、脚本、eval 与两份证据架构参考文档  
> 结论性质：只读实现审计；不是批准、实现授权、v4 采用决定或发布授权

## 1. 结论

当前仓库可证明的实现范围，比 `SKILL.md` 描述的方法论范围窄：

1. **已有可执行实现**：凭据解析、script READY 探测、Tavily/xAI/Reddit 搜索适配器、旁路 search trace、可选报告副本、run 摘要，以及 Search Contract 文本/fixture 的离线回归检查。
2. **只有规范约束，未见统一运行时执行器**：Search Contract 状态机、用户确认判定、scope 纠偏清除、Research Map、多轮 Critic/Reflection、来源交叉验证、最终报告生成和 Phase 5 全字段日志。它们写在 `SKILL.md`，但没有一个脚本把完整 Phase 1–5 状态机执行并强制 gate。
3. **本地未实现 v4 core**：未见 versioned ledger schema、Source/Evidence/Claim/Relation/Inference 一等记录、稳定知识记录 ID、locator validator、manifest/hash、journal replay、package 完成状态、状态传播或语义负例 validator。
4. **现有 trace 不是耐久证据资产**：它记录运行和搜索调用，默认可显式清理，原始结果仅在 full/force 模式保存，报告副本可选；它没有保存已确认 contract，也不是 Source/Evidence/Claim 图谱。
5. **可在不改变用户可见研究行为的前提下先做 P0 准备**：冻结术语和状态表、建立独立 schema/fixtures/validator、创建 opt-in shadow 输出与回放工具。将 validator 接入主路径、要求 Standard 默认生成 package、改变 Quick/Standard/Deep 输出或让 gate 由运行时强制，均属于后续行为迁移。

两份参考文档均明确限制其权威：基线说明先前只核对规范文本、未逐项检查脚本（`references/evidence-linked-research-baseline-2026-07-27.md:3-10,36-38`）；v4 文件是候选规范，不是代码、批准或迁移授权（`references/research-evidence-core-v4-draft-spec.md:1-17`）。本审计未联网，也没有独立复核其中列出的外部资料。

## 2. 审计范围与 `not found` 口径

已逐文件读取：

- `SKILL.md`；
- `scripts/` 下全部 16 个当前文件，包括 `scripts/lib/`；
- `evals/test_prompts.json` 与 `evals/validate_contract_gate.mjs`；
- `references/evidence-linked-research-baseline-2026-07-27.md`；
- `references/research-evidence-core-v4-draft-spec.md`；
- 为核对 portability/runtime coupling，补读 `SETUP.md`、`env.example`、`references/runtimes.md`、`references/security.md`。

本文中“未找到实现”仅表示：在上述 `scripts/`、`evals/` 及补读的当前 skill 本地文件中，按 `ledger`、`manifest`、`schema_version`、`package_id`、`journal`、`source/evidence/claim/relation/inference` ID、`locator`、`independence_group`、`entailment`、`scope_match`、`hash/checksum`、`complete_validated`、replay/recovery 等相关词及代码结构检查后未发现对应能力。它不证明仓库外、宿主内部或未纳入本审计的历史产物中不存在类似能力。

## 3. 当前规范说了什么

### 3.1 v3 当前行为规范

- READY：每次研究先运行 doctor；script 或 host web 任一可用即可 READY，未 READY 时停止外部搜索（`SKILL.md:63-90,141-150`）。
- Search Contract：交互式多源研究必须走 `DRAFT -> CONTRACT_ACCEPTED -> SEARCHING`；用户重述不算确认；单一用户提供来源可走 `NARROW_SELFCHECK`；headless 必须具备六个预批准字段（`SKILL.md:173-196`）。
- 搜索前后流程：contract 接受后才拆子问题和构造 query；每轮要更新 Research Map、Critic、Reflection，事实必须有来源 URL（`SKILL.md:202-225,347-389`）。
- 收敛和日志：按覆盖、方向变化和轮次上限停止；结束时 finalize trace 并写 run-log（`SKILL.md:396-440`）。
- 最终报告：规范要求 frontmatter、逐子问题答案、证据强度、来源、争议点、缺口和元数据（`SKILL.md:578-655`）。
- trace：是默认 light 的旁路 debug/对比记录，失败不阻塞，默认不自动删除但可显式按 14 天清理（`SKILL.md:697-733`）。

### 3.2 仅属 v4 候选的内容

以下不是 v3 已实现行为：

- Source、Evidence、Claim、Relation、Inference、Decision Context、Decision、Review、Package 的类型化语义（`references/research-evidence-core-v4-draft-spec.md:47-63`）。
- Relation 的方向、polarity、support role、entailment、scope match、理由和审查状态（同文件 `111-135`）。
- Claim 生命周期及下游 stale/invalidated 传播（同文件 `154-196`）。
- independence group、派生来源和独立佐证计数规则（同文件 `198-218`）。
- canonical ledger、稳定不可复用 ID、portable package、manifest/hash 和 `complete_validated` 状态（同文件 `220-246,328-363`）。
- 正负 fixtures、语义 validator、journal replay、确定性报告投影和跨 runtime portability gate（同文件 `464-500,539-563`）。

v4 自己要求迁移时先保持 v3 行为不变，以 opt-in shadow mode 生成候选 package，且未经 P0/P1 与明确批准不得切换默认行为（同文件 `522-537,541-563`）。

## 4. 当前 scripts / evals 清单及可观察角色

| 文件 | 可观察角色 | 能证明什么 | 不能证明什么 |
|---|---|---|---|
| `scripts/doctor.mjs` | 输出 capability、tier、ready；`--require-ready` 不满足时 exit 1 并打印 setup 卡（`28-53,87-111,155-161`） | script READY 探测存在 | 不执行 Search Contract，也不拦截其他搜索脚本 |
| `scripts/lib/credentials.mjs` | allowlist、never-override、通用/宿主凭据源、capability report（`26-74,209-256,280-340,345-400`） | 凭据与能力探测代码存在 | 不提供 secretless broker；安全文档也明确未实现（`references/security.md:74-76`） |
| `scripts/lib/envfile.mjs` | 最小 dotenv parser（`15-60`） | 可解析本地 env 文件 | 不验证权限、轮换或凭据生命周期 |
| `scripts/lib/print-key.mjs` | 已弃用但仍可把 key 写到 stdout（`1-23`） | 存在显式风险提示 | 不能据此声称所有路径绝不打印 secret |
| `scripts/research.mjs` / `research.sh` | Tavily Research API 调用、轮询、JSON 输出/可选文件输出（`research.mjs:28-57,59-123`; `research.sh:1-6`） | 深度搜索 adapter 可执行 | 不运行 READY gate、contract gate、Research Map 或证据 ledger |
| `scripts/grok_search.mjs` | xAI web/x search、结果与 citation URL 归一化（`29-111,138-206,280-359`） | 搜索结果/URL 结构化能力 | 不验证 URL 内容是否蕴含结果文本，不生成 locator/Claim/Relation |
| `scripts/chat.mjs` | xAI chat、可选图片、citation URL 收集（`63-117,126-150`） | 通用 xAI adapter | 不属于证据 core 或研究状态机 |
| `scripts/models.mjs` | 列出 xAI 模型（`20-76`） | 模型探测工具 | 不验证研究能力或 gate |
| `scripts/reddit-cli.js` | Reddit posts/search/info/post 读取（`46-160,172-308`） | Reddit 来源访问 adapter | 输出无 canonical Source ID、Evidence locator 或独立性信息 |
| `scripts/trace.mjs` | trace 的 init/append/finalize/prune/status CLI（`81-211`） | trace CLI 存在且 soft-fail | 不保证调用者一定 init/append/finalize；无 contract/ledger validator |
| `scripts/lib/trace.mjs` | run/call/raw/report/run-log 持久化（`5-18,120-159,165-286,288-387`） | runtime trace 数据模型与写入存在 | 不是 durable package；没有知识实体、manifest、hash 或 replay |
| `scripts/search_with_trace.sh` | 包装 smart-search，将 stdout 原样返回并旁路 append（`14-60`） | 一条自动 trace 接入路径 | 只覆盖经此 wrapper 的搜索；不会检查 READY/contract |
| `scripts/selftest.mjs` | 对 Grok 搜索、chat、models 发真实 API 请求并断言基本输出 shape（`16-113,116-191`） | 搜索 adapter 的 live sanity test 设计存在 | 不测试 READY、contract、trace、claim/evidence、负例或 portability |
| `scripts/install.sh` | symlink 多宿主、初始化 config 目录、运行 doctor（`6-45,57-73`） | 安装/接线脚本存在 | 不验证跨机器 portable package |
| `evals/test_prompts.json` | 20 个声明式 prompt/期望；14–20 覆盖 contract 相关场景（`257-342`） | 有行为期望 fixture | JSON 本身不会执行 agent，也不能证明期望行为发生 |
| `evals/validate_contract_gate.mjs` | 读取 `SKILL.md` 与 fixtures，正则/字段断言（`12-86`） | 可防止规范文字和部分 fixture 被意外删改 | 不调用 agent、doctor、搜索脚本或状态机；不是 runtime gate test |

## 5. Search Contract / READY gate 覆盖与测试

### 5.1 READY：有探测器，无统一拦截器

`doctor.mjs` 实现了 `--require-ready`、tier 和 exit code（`scripts/doctor.mjs:28-53,95-111,155-161`）；实际 `runnable` 只由 Tavily、xAI 或 OpenRouter key 决定（`scripts/lib/credentials.mjs:345-400`）。

但搜索入口自身不调用 doctor：

- Tavily adapter 只检查 `TAVILY_API_KEY` 后直接请求 API（`scripts/research.mjs:28-49,59-80`）。
- Grok adapter 只检查 `XAI_API_KEY` 后直接请求 API（`scripts/grok_search.mjs:99-109,186-213`）。
- smart-search wrapper 直接执行目标脚本（`scripts/search_with_trace.sh:34-47`）。
- Reddit CLI 直接执行网络请求（`scripts/reddit-cli.js:16-43,172-308`）。

因此 READY 是“有可执行 doctor + 规范要求调用”，不是所有本地搜索入口都无法绕过的代码级门闩。

另有文档/实现漂移：`SKILL.md` 把“已知搜索 CLI”写入 script READY 定义（`SKILL.md:65-68`），`references/runtimes.md` 也称已知 CLI 可使 doctor exit 0（`references/runtimes.md:63-70`），但当前 `capabilityReport().runnable` 明确只看三种 API key，CLI presence 不足（`scripts/lib/credentials.mjs:371-390`）。`doctor.mjs` 文件头也保留了“key/CLI”表述（`scripts/doctor.mjs:3-12`）。

### 5.2 Search Contract：规范和离线防回退检查存在，运行时执行未证实

规范完整定义了 interactive、narrow、headless 和 correction 四条路径（`SKILL.md:173-200`）；fixtures 14–20 为这些路径写了期望（`evals/test_prompts.json:257-342`）。

离线 validator 会检查：

- `DRAFT -> CONTRACT_ACCEPTED -> SEARCHING` 文本；
- displayed contract、重述不算确认、禁止 accepted-selfcheck；
- narrow 单一来源、headless 六字段；
- scope correction purge；
- fixtures 15、16、17、20 的若干字段。

证据见 `evals/validate_contract_gate.mjs:27-86`。本次实际运行该离线 validator，结果为通过；这只证明当前规范字符串与选定 fixture 一致。

未发现执行 Search Contract 状态机的脚本、confirmation store、headless 六字段 parser、query 之前的统一 assertion 或纠偏后的持久清除器。精确搜索范围为 `scripts/` 与 `evals/` 全部当前文件；contract 相关代码命中仅出现在 `validate_contract_gate.mjs`、声明式 fixtures 和 doctor 的 READY 文字中。故不能从本地 artifacts 验证任一宿主会实际阻止未确认搜索。

## 6. Trace / report 持久化模型

### 6.1 已实现

- run ID 由时间、问题 slug 和随机值组成（`scripts/lib/trace.mjs:46-65`）。
- init 创建 `run.json`、`raw/` 与 `current-run.json`（同文件 `120-159`）。
- append 保存 query、tool、degraded、结果数、top URLs、可选 raw path 等到 `calls.jsonl`（同文件 `165-282`）。
- light 模式只保存摘要/top URLs；full/force 才写截断后的 raw JSON（同文件 `29-44,227-266`）。
- finalize 更新 `run.json`，可选复制/写入 `report.md`，并追加跨 run 的 `run-log.jsonl`（同文件 `288-387`）。
- `run.json` 和 `current-run.json` 使用临时文件加 rename 的原子 JSON 写入（同文件 `68-82`）。

### 6.2 差距与风险

- **contract 未持久化**：run metadata 只有 question、depth、sub_questions、tier、mode 等（`scripts/lib/trace.mjs:120-146`），没有六字段 contract、确认主体/时间/证据或 contract state。
- **Research Map/Reflection 未持久化**：`calls.jsonl` 字段是搜索调用摘要（同文件 `245-266`），不含假设、事实、Critic、Reflection、方向变化事件或状态重放信息。
- **报告不是必需产物**：只有传入 `report_text` 或存在的 `report_path` 才生成/复制 `report.md`（同文件 `324-334`）。
- **raw 默认不耐久**：默认 light，不保存全文；full raw 还会截断（同文件 `29-44,227-238`）。
- **可清理**：显式 prune 会递归删除旧 run（同文件 `389-408`；规范边界见 `SKILL.md:728-731`）。
- **并发未受控**：`current-run.json` 是单指针，append 无 run ID 时回退到该指针（同文件 `185-195`）；JSONL 直接 append、run counters 采用无锁 read-modify-write（同文件 `79-82,268-280`）。未见 lock、并发测试或冲突恢复。
- **“原子写”仅限部分 runtime 元数据**：atomic helper 覆盖 JSON 替换，不覆盖 `calls.jsonl`/`run-log.jsonl`、raw/report、跨文件事务或 package 完成状态（同文件 `72-82,324-365`）。不能把它解释为 v4 package 原子完成/中断恢复。
- **trace 与报告都不是知识权威**：现有 report 是 trace 副本，run-log 是运行摘要；当前没有 canonical ledger。v4 草案要求两者只通过显式 ID 互链（`references/research-evidence-core-v4-draft-spec.md:342-363,522-531`），本地实现尚无 `package_id`。

## 7. 当前 Source / Evidence / Claim / Inference / Relation 能力

### 7.1 v3-compatible 的现有能力

- v3 规范要求已知事实带 URL、关键事实评 Evidence Strength，并在最终报告集中列来源（`SKILL.md:351-380,606-655`）。
- Grok adapter 能返回 `title/url/snippet/author/posted_at` 和 citation URL（`scripts/grok_search.mjs:156-184,314-359`）。
- Reddit adapter 能返回 post URL/permalink、时间和正文（`scripts/reddit-cli.js:46-88,110-160`）。
- trace 能保留 top URLs，full 模式可保存 raw response（`scripts/lib/trace.mjs:93-115,199-266`）。

这些能力支持“来源链接与运行调试”，但不能自动升级为证据图。

### 7.2 本地无法验证或未找到

在 `scripts/`、`evals/` 全范围未找到以下实现：

- Source 的 canonical ID、派生谱系或 independence group；
- Evidence 的稳定 ID、精确 locator、摘录/测量值、capture/verification status；
- Claim 类型、状态机或 support/corroboration 计算；
- Inference 的父级、假设、替代解释、falsifier；
- Relation 的方向、端点类型、polarity、entailment、scope match、review；
- Decision Context、Decision、Open Question、Review 一等记录；
- 上游变化触发 stale/invalidated/retracted 下游传播。

唯一相近内容是 v3 的自然语言报告字段、搜索结果结构与 trace URL；它们没有对应 schema 或语义 validator。v4 的相关定义仍只是草案（`references/research-evidence-core-v4-draft-spec.md:47-63,111-152,154-218`）。

特别是，Grok wrapper 接受模型生成的 `results`/`citations` 并归一化 URL（`scripts/grok_search.mjs:314-359`），没有抓取目标内容后校验 snippet/claim 是否被 locator 蕴含；Tavily Research adapter基本保存服务响应（`scripts/research.mjs:59-123`）。因此不能声称当前实现具有 evidence verification。

## 8. 数据 schema、ID、locator、manifest、hash 与 atomic-write

| 能力 | 当前证据 | 审计判定 |
|---|---|---|
| 运行 ID | `newRunId()` 使用时间、slug、随机字节（`scripts/lib/trace.mjs:46-65`） | 已实现 runtime run ID；不是稳定知识记录 ID |
| call ID | append 时用时间和随机字节生成（同文件 `199-200`） | 已实现 runtime call ID；不可替代 Source/Evidence/Claim ID |
| 数据结构 | `run.json`、`calls.jsonl`、`run-log.jsonl` 的临时代码结构（同文件 `134-145,245-266,363-378`） | 有事实上的 trace shape；无 versioned schema 或兼容 validator |
| locator | 搜索结果通常只有 URL，Reddit 有 permalink（`grok_search.mjs:314-359`; `reddit-cli.js:54-64,80-88`） | 未找到页/段/行/数据行 locator 模型或验证 |
| manifest/hash | `scripts/`、`evals/` 全范围相关搜索无实现命中 | `not found`；只有 v4 草案要求（v4 `342-363`） |
| canonical ledger | 同上 | `not found`；v4 草案定义在 `220-246` |
| atomic write | trace JSON 临时文件 + rename（`scripts/lib/trace.mjs:72-77`） | 局部已实现；不等于多文件 package 原子完成 |
| recovery/replay | trace 可读取当前指针和 finalize，未见 journal replay 或中断恢复器（`scripts/trace.mjs:177-204`; `scripts/lib/trace.mjs:288-387`） | v4 能力 `not found` |
| 相对路径 | raw path 在 run 内保存为 `raw/<call>.json`（`scripts/lib/trace.mjs:227-266`） | 局部相对；run metadata 同时保存本机 home/run_dir/report_path（`134-154,324-333,365-378`），不是 portable package |

## 9. Validation 与负例 fixture 覆盖

### 9.1 已有覆盖

- `validate_contract_gate.mjs` 是纯离线、无外部调用的规范/fixture 防回退检查（`1-5,27-86`）。
- `test_prompts.json` 有 20 条声明式场景，其中 14–20 覆盖相邻主题漂移、显式确认、narrow、headless、scope correction 和重述不算确认（`257-342`）。
- `selftest.mjs` 对 Grok/web/x/chat/models 的输出形状、URL、去重和非空结果做 live sanity checks（`45-113,116-191`）。

### 9.2 关键不足

- contract validator 只匹配 `SKILL.md` 文本与 fixture 字段，不运行 agent 或任何 search entrypoint（`evals/validate_contract_gate.mjs:27-86`）。
- fixtures 1–13 是期望数据，没有对应 runner；其中部分期望还可能与 v3.15.1 的“先展示 contract”冲突，例如清晰研究场景直接期望调用外部工具（`evals/test_prompts.json:5-64,125-163,237-253`），当前 validator 不检查这些回归。
- 未见 doctor/credential/trace 的离线单元测试，也未见 wrapper 绕过、并发 current-run、soft-fail、raw 截断、redaction、prune、report optional 等负例测试。
- 未见 v4 草案要求的错 locator、不蕴含、伪独立、推断伪装事实、非法类型边、断链、孤儿、循环、stale review、hash mismatch、绝对路径、secret 泄漏、伪完成或 Quick 越权 fixtures/validator。精确候选列表见 v4 `481-500`。
- 未见具名错误代码、失败层级和阻断的下游状态；这也是 v4 草案明确要求但尚未实现的部分（v4 `500`）。

## 10. Portability 与 runtime coupling

### 10.1 已做对的 v3-compatible 部分

- 凭据加载支持 process env、通用 research-pro home、可关闭的宿主 adapter 和 opt-in CWD env（`scripts/lib/credentials.mjs:10-19,209-256,280-340`）。
- 安装脚本可把同一 skill 接到多个宿主目录（`scripts/install.sh:31-45`）。
- 搜索方法与 backend 在规范上被区分，smart-search 只是工具层（`SKILL.md:770-810`）。
- trace 输出根可由 `RESEARCH_PRO_HOME` 改写（`scripts/lib/trace.mjs:25-33`）。

### 10.2 仍有耦合和漂移

- search adapters 硬编码具体供应商 API 与 Node `fetch`；它们是 runtime adapter，不是 portable core（`scripts/research.mjs:59-88`; `scripts/grok_search.mjs:186-206`; `scripts/reddit-cli.js:3-43`）。
- smart-search wrapper 默认依赖两个宿主特定位置，并使用 `$HOME`（`scripts/search_with_trace.sh:16-21`）。
- wrapper 的 stderr 固定写到共享 `/tmp/research-pro-search.err` 与 `/tmp/research-pro-trace.err`（同文件 `39-57`），未见并发隔离。
- trace metadata 保存本机绝对 home/run_dir/report_path（`scripts/lib/trace.mjs:134-154,324-333,365-378`）；作为 runtime trace 可接受，但不能直接作为 portable artifact。
- host-native READY 由 agent 自行判定，doctor 只写提示而不探测宿主工具（`scripts/doctor.mjs:95-103`）。
- `SETUP.md` 仍标版本 `3.13.0-mf`（`SETUP.md:1-6`），与当前 `SKILL.md` 的 `3.15.1-mf`（`SKILL.md:19-25`）不一致。
- `doctor.mjs` setup 卡中的命令把脚本路径与 `--require-ready` 放进同一对引号（`scripts/doctor.mjs:61-71`），按字面复制会把它当成一个不存在的文件名；这是 setup 路径缺陷，不是证据 core 问题。

## 11. 排名后的直接工作 backlog

以下排序是审计建议，不是实施授权。P0 指“任何 v4 实际使用前必须补齐的最小准备”，不表示完成后自动获准启用 v4。

### A. 文档 / 规范（不改变用户可见研究行为）

1. **P0-A1：冻结 core 术语、允许端点、Relation 语义、Claim 生命周期与失效表。**  
   产物只做规范冻结，不接入 v3 主路径。前置依据：v4 `47-63,73-196`；未决项必须继续标 `DRAFT/UNRESOLVED`（v4 `574-593`）。
2. **P0-A2：定义 v3-to-v4 mapping 与“不可映射”报告。**  
   明确 URL-only、无 locator、事实/推断混写、未知独立性时不得补造证据。依据：v4 `522-537`。
3. **P0-A3：修正文档内部漂移。**  
   对齐 READY 是否接受 CLI、setup 版本、doctor setup 命令；只改说明时不改变研究结果，但必须先决定真实 contract。证据：`SKILL.md:63-81`、`references/runtimes.md:63-80`、`scripts/lib/credentials.mjs:371-400`、`SETUP.md:1-6`、`scripts/doctor.mjs:61-71`。
4. **P0-A4：定义 portable core 与 adapter capability contract。**  
   只规定边界、失败模式和 capability schema，不替换现有 adapter。依据：v4 `502-520`。

### B. Fixtures / validators（默认离线，不改变用户可见研究行为）

1. **P0-B1：建立 versioned ledger/manifest schema 与错误代码表。**
2. **P0-B2：先实现结构 validator。**  
   覆盖必填字段、ID 唯一性、引用存在性、合法端点、无环、状态转换、相对路径、manifest/hash 和 secret/绝对路径拒绝。
3. **P0-B3：实现语义负例 fixtures。**  
   覆盖 v4 `481-500` 的全部关键失败；每个 fixture 声明错误代码、失败层级与阻断状态。
4. **P0-B4：补 v3 回归 harness。**  
   让 fixtures 1–20 真正驱动一个可观察执行器或模拟 adapter，验证“未确认时零搜索调用”；当前离线正则检查继续保留，但不再被视为行为证明。
5. **P0-B5：补 trace/credential 单元与并发负例。**  
   覆盖 current-run 串线、JSONL 并发、soft-fail、redaction、raw 截断、可选报告、prune 边界和 READY 文档一致性。

只要 validators 不接入 v3 用户路径、只在 CI/本地显式运行，上述工作不会改变用户可见研究行为。

### C. Shadow-mode scaffolding（opt-in 时可保持 v3 默认行为）

1. **P0-C1：建立独立、opt-in 的 package writer。**  
   写入新输出根；初始状态 `incomplete`；不覆盖 trace 或 v3 report；失败只形成诊断。
2. **P0-C2：实现 run/package 显式互链。**  
   trace 仍是 runtime debug，package 是候选耐久资产；双方只保存非秘密 ID。
3. **P0-C3：回放已完成样本并生成 mapping gap report。**  
   不补造 locator、独立性或 Claim 类型；比较 v3 报告与 v4 投影的语义差异。
4. **P0-C4：实现确定性 report projection 与跨输出根验证。**  
   仍保持 opt-in，不改变现有最终答复。

shadow 只有在默认关闭、输出隔离、失败不污染 v3、且不改变最终答复时，才属于“无用户可见行为变化”。依据：v4 `526-535,615-617`。

### D. 行为变化迁移（不属于无行为变化 P0 准备）

1. **P1-D1：在实际研究入口统一强制 READY 与 Search Contract。**  
   这会把当前 agent 文本纪律变成代码级 gate，可能改变此前可绕过的调用。
2. **P1-D2：让 Standard 默认生成并验证 package。**  
   会改变延迟、失败模式、输出与存储义务；必须先通过 shadow 与明确批准（v4 `532-535,554-563`）。
3. **P1-D3：把 Source/Evidence/Claim/Relation/Inference 写入主研究循环。**  
   会改变 Research Map、报告生成和审查流程。
4. **P1-D4：启用 claim 状态传播、stale review 和 fail-closed publication。**
5. **P1-D5：按新契约调整 Quick/Standard/Deep 默认产物。**  
   Quick 必须继续轻量，不能因 v4 被强制提升为完整 package（v4 `380-412,534`）。
6. **P1-D6：拆分并替换现有 search/storage/trace/publication adapters。**  
   只能在 core 语义稳定后进行（v4 `535`）。

## 12. 风险与前置条件

| 风险 | 直接后果 | 前置条件/控制 |
|---|---|---|
| 把 `SKILL.md` 意图当实现 | 高估 gate、证据链和报告一致性 | 行为声明必须有 runner/test 或明确标“规范层” |
| 把 trace 当 canonical ledger | 可清理、URL-only、可选 report 无法支撑独立审查 | 明确 trace/package 权威边界；先做 opt-in package |
| 自动把多个 URL 算独立佐证 | 转载/摘要造成伪 corroboration | derived-source/independence schema + 人工可审查理由 |
| 自动把 v3 报告句子升级为 factual Claim | 推断被伪装成事实 | mapping gap report；未知时保留 unknown，不补造 |
| locator/entailment 自动化过度承诺 | “有链接”被误写成“证据直接支持” | 先做负例集和人工标注；未决时 fail closed/review_required |
| 写入中断或并发串线 | package/trace 被误标完成或关联错误 run | package 状态机、锁/事务策略、并发测试、恢复测试 |
| portable artifact 泄露本机信息或 secret | 无法安全分享 | package-relative paths、secret scanner、manifest allowlist |
| shadow 改变现有研究结果 | 尚未批准的 v4 污染 v3 | 默认关闭、独立目录、只读映射、失败不覆盖 v3 |
| fixtures 与 v3.15.1 语义漂移 | 回归“通过”但行为自相矛盾 | 先清理 fixtures 1–13 与 confirmation gate 的冲突 |
| 未决设计被实现固化 | 实现先于治理决定 | 先冻结词汇、状态、ID、journal、review 和 acceptance 指标 |

开始任何行为迁移前，至少需要：

1. 明确批准采用哪一版 core 语义，而不是直接把当前 v4 草案当标准；
2. 决定稳定 ID、journal 重放强度、Standard 最小记录量和 stale 传播边界；
3. 完成正负 fixtures、validator 和 v3 Search Contract/trace/report 回归；
4. 完成跨输出根、跨机器/运行时 portability 与中断/并发测试；
5. 定义 shadow 退出指标、人工审查责任和明确批准点；
6. 保持外部参考资料为 `pending independent revalidation`，直到另有独立复核记录。

## 13. 审计边界声明

- 本文没有联网，没有独立重验证外部参考资料。
- 本文没有运行 live API selftest；只实际运行了离线 `evals/validate_contract_gate.mjs`，结果通过。
- “通过”仅表示该脚本当前的字符串/fixture 断言通过，不代表 runtime Search Contract 已被执行。
- 本文不批准 v4、shadow mode、schema、validator、package、发布或默认行为迁移。
