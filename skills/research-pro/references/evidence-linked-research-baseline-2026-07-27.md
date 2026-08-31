# Evidence-Linked Research 基线记录

## 1. 文档目的、范围与验证边界

- 日期：2026-07-27
- 当前 Research Pro 版本：`3.15.1-mf`
- 目的：冻结截至本文日期已知的本地现状、研究完整性目标、评审发现、候选概念模型与未来验收边界，供后续实现者和外部审查者使用。
- 范围：当前 skill 规范、Evidence-Linked Research 设计简报、GPT-5.6-Sol 只读评审，以及简报列出的四项待复核外部来源。
- 非目标：本文不是实现计划，不修改 Research Pro，不批准或发布 v4，不替代 schema、validator、eval 或运行时验证。
- 验证边界：本轮直接读取了 `skills/research-pro/SKILL.md`、设计简报和 GPT-5.6-Sol 评审；未联网，未独立复核外部来源，也未逐一检查脚本、运行时行为、历史研究包或跨运行时兼容性。因此，“已验证当前状态”只表示对 skill 规范文本的验证。

## 2. 用户的研究完整性目标

目标是让研究成为可持久保存、可审查、可对外分享的知识产物，而不只是聊天结论和松散 URL。完整性要求包括：

1. 报告中的实质性事实主张有可验证依据；标题、用户输入和流程元数据不应被误当成外部事实验证对象。
2. 分析、推断和建议能够追溯到上游事实或主张，并说明推理为何成立、依赖哪些假设、有哪些替代解释和剩余不确定性。
3. 允许推断，但不得把推断写成已经被外部证据证明的事实。
4. 多轮研究持续保存来源、证据、主张、关系、推断、反思与方向变化，最后生成面向读者的报告。
5. 最终产物可由未参与研究过程的外部审查者理解、检查和分享。
6. 可移植方法与模板不依赖个人凭据、私有路径、特定看板、特定搜索后端或单一 agent runtime。

## 3. 已验证的当前本地状态

以下观察来自当前 `skills/research-pro/SKILL.md`：

- 版本与总原则：第 20 行声明 `3.15.1-mf`；第 55–61 行定义当前 skill、local-first 原则及凭据/trace 入口。
- 研究启动治理：第 63–90 行定义 READY 门闩和 fail-closed 行为。
- 研究地图：第 114–133 行包含 Search Contract、假设、子问题、带来源的已知事实、线索和轮次；第 133 行明确研究地图是思考载体，不是最终输出。
- 范围确认：第 160–171 行要求先检查本地上下文；第 173–200 行定义 Search Target Confirmation Gate；第 189–196 行规定 `DRAFT -> CONTRACT_ACCEPTED -> SEARCHING` 状态机及纠偏清除规则；第 221–225 行再次禁止未确认合同进入搜索准备。
- 迭代质量控制：第 351–391 行要求多轮地图更新、来源 URL、证据强弱、Critic、Reflection 和自我校准；第 396–413 行定义方向转变、覆盖和轮次停止条件。
- 运行记录：第 416–429 行定义每次研究结束后的 trace finalize 和可选 `report.md`；第 697–731 行列出 run/call/raw/report 产物，并说明 trace 可按 14 天显式清理。
- 最终报告：第 578–657 行定义 frontmatter、逐问题答案、置信度、证据强度、来源、争议、缺口和元数据；第 688 行要求所有事实带来源。
- 方法/工具边界意图：第 770–810 行区分 smart-search 工具层与 research-pro 方法层，并声明 skill 不指定固定 backend。

由此可观察到的规范层结论是：当前版本已经有严格的范围确认、local-first、多轮研究、Critic/Reflection、来源清单、运行 trace 和结构化最终报告；但研究地图仍是工作记忆，trace 允许清理且最终报告写入 trace 为可选，报告引用也尚未形成稳定的 Source/Evidence/Claim/Relation/Inference 图谱。

上述内容不证明每个脚本或 runtime 都完全实现了规范，也不证明不同 runtime 的行为一致。

## 4. 证据与来源登记

| ID | 来源 | 类型 | 本文使用状态 | 边界 |
|---|---|---|---|---|
| L-01 | `skills/research-pro/SKILL.md` | 当前本地规范 | 已直接读取 | 仅验证规范文本，不代表全部脚本/运行时 |
| D-01 | `research-pro-evidence-linked-design.md` | Codex 设计简报 | 已直接读取 | 候选设计与问题集，不是批准记录 |
| R-01 | `codex-gpt-5.6-sol-clean-review.md` | GPT-5.6-Sol 只读评审 | 已直接读取 | 评审综合，不是实现或外部事实复核 |
| X-01 | [NIST AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf) | 外部来源 | `pending independent revalidation` | 本文不复述其内容为已验证事实 |
| X-02 | [Anthropic: Building a multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | 外部来源 | `pending independent revalidation` | 本文不复述其内容为已验证事实 |
| X-03 | [GitHub protected branches documentation](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) | 外部来源 | `pending independent revalidation` | 本文不复述其内容为已验证事实 |
| X-04 | [Self-Refine paper](https://arxiv.org/abs/2303.17651) | 外部来源 | `pending independent revalidation` | 本文不复述其内容为已验证事实 |

四个外部来源及设计简报对其内容的描述，均为 `pending independent revalidation`。任何由它们导出的架构判断，在本文中只能标为 `design synthesis` 或假设。

## 5. 发现

### 5.1 已观察的当前状态

优势：

- 已有显式用户确认的 Search Contract 和防相邻主题漂移规则。
- 已有 local-first、子问题分解、多轮搜索、矛盾检查、Critic、Reflection 和停止条件。
- 已要求事实带来源，并提供结构化最终报告、运行 trace 与跨 run 摘要。
- 已表达方法论与固定搜索 backend 分离的意图。

缺口：

- Research Map 与逐轮 Reflection 没有被规范为持久、结构化、可重放的研究日志。
- 来源主要在报告/子问题层引用，没有稳定的 source、evidence、claim、relation、inference ID 和引用完整性约束。
- 没有一等 evidence ledger 来保存精确 locator、摘录或测量值、访问时间和验证状态。
- 没有一等 inference ledger 来保存父级支持、假设、替代解释和证伪条件。
- 证据质量、主张支持状态、推断置信度和决策风险尚未清楚分层。
- 可清理的运行 trace 与耐久知识资产之间没有明确权威边界；`report.md` 仍为可选。
- 规范中的 READY、凭据、工具路由、trace 和文件位置仍含 runtime-specific 约定。

### 5.2 综合与设计建议

以下均为 `design synthesis`，尚未采纳：

- 用带类型关系的证据图代替线性流水线。
- 以单一结构化 ledger 作为权威数据源，最终报告作为其读者视图。
- 记录派生来源与独立性分组，避免把转载或共同上游来源误计为独立佐证。
- 将决策目标、标准、约束、权衡、风险容忍度和可逆性作为 Decision Context，而不是假设 Decision 只由事实链自然推出。
- 将可移植方法/schema/validator 与搜索、凭据、存储、UI、发布等 runtime adapter 分离。

## 6. 修正后的概念模型

原始候选链：

```text
Source -> Evidence -> Claim -> Inference -> Decision
```

不足在于：它只能表示节点先后，不能表示某条证据究竟是支持、反驳还是仅提供上下文，也不能表达蕴含强度、scope 是否匹配、关系是否经过审查。稳定 ID 本身不能防止错误引用链。

`design synthesis`：将 `Relation` 作为缺失的一等记录，形成有类型的证据图：

```text
Contract / Question
        |
Source --contains--> Evidence
Evidence --supports / contradicts / contextualizes--> Claim
Claim --supports / contradicts--> Inference
Claim / Inference + Decision Context --informs--> Decision
Open Question --requires--> Missing Evidence
```

候选 `Relation` 至少应表达 `from_id`、`to_id`、关系类型、`entailment`、理由、`scope_match` 和审查状态。这里的新增 Relation 是 Codex 评审形成的设计建议，不是已获接受的 v4 标准。

## 7. 明确的非结论与开放问题

- 本文不认定 v4 已获接受、可投入使用或可公开发布。
- 本文不认定候选 package、schema、字段名或分级策略已经成为标准。
- 本文不认定四个外部来源的内容或适用范围已被本轮独立复核。
- 本文不认定当前规范的所有脚本/runtime 行为均已实现或一致。
- “独立 QA profile 比同一 profile 的 fresh context 更适合承担验收批准”目前只是 `hypothesis`。在存在本地架构证据、威胁模型、明确验收指标和比较评估之前，不得把它写成事实或直接据此形成强制决策。
- 待回答：本地 profile 是否确实形成独立的权限、身份、记忆、审计和批准边界？
- 待回答：独立 profile 与 same-profile fresh context 在缺陷发现率、错误接受率、路径依赖和可审计性上是否存在可重复差异？
- 待回答：Standard 研究的最小可审计记录量是多少，才能兼顾维护成本与错误链防护？
- 待回答：哪些 claim 状态变化应使下游 relation、inference、decision 和既有审查自动失效？
- 待回答：外部用户在不同文件系统、权限模型和搜索工具下能否生成、验证和迁移同一 package？

## 8. 候选 portable core 与 runtime adapter 边界

以下是未接受的设计方向（`design synthesis`）。

Portable core 候选职责：

- Search Contract 状态机与范围门闩；
- Source、Evidence、Claim、Relation、Inference、Decision、Open Question 的语义；
- versioned schema、ID 唯一性、引用语法、状态转换与撤回规则；
- evidence quality、support status、inference confidence、decision risk 的分层词汇；
- journal 事件格式、保留/隐私/snapshot 默认规则；
- validators、负例 fixtures、兼容规则和 adapter capability contract。

Runtime adapter 候选职责：

- 搜索、抓取、浏览器和 backend 路由；
- 凭据加载、READY 探测和 secret storage；
- 用户确认 UI、聊天、看板和发布；
- 输出根选择、文件系统集成、原子写入、恢复与重试；
- runtime trace、snapshot 获取、权限和并发控制。

Portable artifact 内候选使用 package-relative 路径；本机绝对输出根只属于 adapter 运行元数据，不进入可移植 contract。

## 9. 候选 package / 输出模型

以下布局是候选方案，不是已采纳标准：

```text
YYYY-MM-DD--topic-slug--<short-id>/
├── manifest.yaml
├── contract.yaml
├── journal.jsonl
├── ledger.yaml
├── final-report.md
└── snapshots/          # optional
```

- `manifest.yaml`：候选记录 `schema_version`、`package_id`、文件清单、hash、生成器版本、关联 run 和完成状态。
- `contract.yaml`：候选记录问题、对象、scope、answer shape、确认状态和保留/snapshot 策略；不保存私有绝对路径。
- `journal.jsonl`：候选 append-only 事件流，记录轮次、搜索、记录创建、状态变化、Reflection 和方向调整。
- `ledger.yaml`：候选唯一结构化权威源，容纳 sources、evidence、claims、relations、inferences、decisions 和 open questions。
- `final-report.md`：候选由 ledger 投影出的读者报告，不作为反向编辑的权威数据源。
- `snapshots/`：可选且默认关闭；是否保留应受版权、许可、隐私和最小必要原则约束。

候选分级（`design synthesis`）：Quick 不强制耐久 package；Standard 使用上述最小五文件；Deep/高风险研究增加完整反证、替代解释、审查状态和受控 snapshot。该分级仍需实际评估后才能采纳。

## 10. 未来接受门槛

以下是 acceptance gates，不是实现步骤。

### P0：任何 v4 实际使用前

- `Relation` 是一等记录，entailment 与 scope match 可审查。
- 存在版本化 schema、单一权威 ledger、稳定且不可复用的 ID 规则。
- validator 能拦截断链引用、孤儿记录、非法类型边、循环依赖和越权状态转换。
- 派生来源与 independence group 规则能阻止伪独立佐证。
- factual claim、inference 和 decision 之间有可机器检查的类型门禁。
- Decision Context 覆盖目标、标准、约束、权衡、风险和可逆性。
- package 支持原子完成状态、中断恢复，并明确 Quick/Standard/Deep 产物契约。
- 错 locator、摘录不蕴含 claim、重复转载、推断伪装事实、超范围建议等负例 eval 通过。
- 隐私、版权、secret、snapshot 和保留策略有安全默认值。

### P1：公开发布前

- v3 Search Contract、trace 和最终报告兼容性回归通过。
- 跨 runtime adapter contract、相对路径和跨机器 portability 测试通过。
- journal 可重放，final report 可确定性生成。
- claim 变化能使 stale review 失效，disputed/retracted 状态能传播到下游。
- 人工标注的 relation/entailment 测试集与独立盲审达到预先定义的验收标准。

### P2：后续增强

- 内容寻址、source fingerprint 与去重达到可接受准确度。
- claim graph 可视化、多审查者签名和独立 QA workflow 有清晰收益证据。
- 增量研究合并、跨 package 引用和自动矛盾发现具备兼容与冲突规则。
- 知识库、浏览器和发布集成不破坏 portable core 边界。

## 11. 决策日志

截至 2026-07-27，仅记录已明确作出的决定：

| 决定 | 状态 | 含义 |
|---|---|---|
| 先冻结并记录基线，再考虑全面修复 | 已决定 | 本文只保存现状、发现与候选方向，不实施 Research Pro 修复 |
| 不为运行研究而启用全局 dispatcher | 已决定 | 本次不改变全局调度或运行配置 |
| v3 暂不变更 | 已决定 | 不编辑 `SKILL.md`、脚本、eval、配置、registry 或 lock 文件 |
| v4 设计是否接受 | 未决定 | 本文不得被引用为批准、发布或迁移授权 |

## 12. 参考资料与文档来源

本基线由以下材料综合形成：

1. 当前本地规范：`skills/research-pro/SKILL.md`，版本 `3.15.1-mf`。
2. 设计输入：`research-pro-evidence-linked-design.md`。
3. 评审输入：`codex-gpt-5.6-sol-clean-review.md`，只读、未联网评审。
4. 外部来源 X-01 至 X-04：均为 `pending independent revalidation`，本文未以其内容建立已验证事实。

来源角色说明：

- 第 3 节的当前状态以 L-01 的具体标题和行号为依据。
- 第 2、8、9 节包含设计简报提出的目标或候选方向。
- 第 5–10 节中的模型修正、Relation、package 压缩和 acceptance gates 属于 `design synthesis`。
- 本文没有聊天历史依赖；未来读者可仅凭本文区分已观察事实、候选设计、假设、未决问题和已作决定。
